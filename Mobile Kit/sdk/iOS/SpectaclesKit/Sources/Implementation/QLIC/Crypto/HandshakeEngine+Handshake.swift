// Copyright © 2024 Snap, Inc. All rights reserved.

import CryptoKit
import Foundation

extension HandshakeEngine {
    /**
     Skips the handshake and directly uses the shared secret and salt to derive the keys

     Debug-only, as a hard-coded shared secret and salt means that we use the same AES key+iv for every connection, making encryption trivial to break.
     */
    func runPresharedHandshake(isClient: Bool, sharedSecret: Data, salt: Data) async throws(QLICConnectionError) -> PeerTrafficSecrets<Hasher> {
        let rootSecret = RootSecret<Hasher>(inputKeyMaterial: SymmetricKey(data: sharedSecret), transcriptHash: salt)
        let appPeerSecrets = rootSecret.expandPeerSecrets(type: .app, transcriptHash: salt)
        if isClient {
            try updateTxKey(appPeerSecrets.clientSecret.expandKeys(securityLevel: .app), isPreshared: true)
            try updateRxKey(appPeerSecrets.serverSecret.expandKeys(securityLevel: .app))
        } else {
            try updateTxKey(appPeerSecrets.serverSecret.expandKeys(securityLevel: .app), isPreshared: true)
            try updateRxKey(appPeerSecrets.clientSecret.expandKeys(securityLevel: .app))
        }
        return appPeerSecrets
    }

    /**
     Runs the client handshake.
     - parameters:
        - authVerifiers: List of verifiers that can verify the server identity
        - authProviders: List of providers that can attest the client identity
        - clientRandomOverride: Optional override for the client random. Only used for unit testing
        - keyAgreementOverride: Optional override for the random ECDH private key. Only used for unit testing
     */
    func runClientHandshake(
        authVerifiers: [any HandshakeAuthVerifier],
        authProviders: [any HandshakeAuthProvider],
        clientRandomOverride: Data? = nil,
        keyAgreementOverride: P384.KeyAgreement.PrivateKey? = nil
    ) async throws(QLICConnectionError) -> PeerTrafficSecrets<Hasher> {
        // Send client hello
        Log.info("[Handshake] Client handshake started, sending client hello")
        let clientRandom: Data
        do {
            clientRandom = try clientRandomOverride ?? secureRandom(count: 32)
        } catch {
            throw .cryptoError(errorCode: .tlsInternalError, reasonString: "Insufficient entropy", underlying: error)
        }
        let keyAgreement = keyAgreementOverride ?? P384.KeyAgreement.PrivateKey()

        let clientKeyShare = keyAgreement.publicKey.derRepresentation
        try sendCryptoFrame(record: .clientHello(
            clientRandom: clientRandom,
            keyShare: clientKeyShare,
            clientAuthenticationAlgorithms: authProviders.map(\.algorithm),
            serverAuthenticationAlgorithms: authVerifiers.map(\.algorithm)
        ), signalsKeyUpdate: true)

        // Receive server hello and calculate shared secret
        Log.info("[Handshake] Client hello sent, awaiting server hello")
        guard case let .serverHello(serverRandom: _, keyShare: keyShare) = try await receiveHandshakeRecord() else {
            Log.error("[Handshake] Received unexpected record \(String(describing: lastRecord))")
            throw unexpectedCryptoRecordError("server hello")
        }
        let sharedSecret: SharedSecret
        do {
            sharedSecret = try keyAgreement.sharedSecretFromKeyAgreement(with: .init(derRepresentation: keyShare))
        } catch {
            Log.error("[Handshake] Failed to generate shared secret: \(error)")
            throw .cryptoError(errorCode: .tlsDecryptError, reasonString: "ECDH Failed", underlying: error)
        }

        // Extract root secret from shared secret
        let helloHash = transcriptHasher.finalize()
        let rootSecret = RootSecret<Hasher>(
            inputKeyMaterial: SymmetricKey(data: sharedSecret),
            transcriptHash: transcriptHasher.finalize()
        )

        // Use root secret to calculate handshake keys.
        let handshakePeerSecrets = rootSecret.expandPeerSecrets(type: .handshake, transcriptHash: helloHash)
        try updateTxKey(handshakePeerSecrets.clientSecret.expandKeys(securityLevel: .handshake))
        try updateRxKey(handshakePeerSecrets.serverSecret.expandKeys(securityLevel: .handshake))

        // Receive authentication request and extract authentication algorithms
        Log.info("[Handshake] Handshake secrets derived successfully, awaiting authentication request")
        guard case let .authenticationRequest(clientAlgorithmIndex, serverAlgorithmIndex) = try await receiveHandshakeRecord() else {
            Log.error("[Handshake] Received unexpected record \(String(describing: lastRecord))")
            throw unexpectedCryptoRecordError("auth request")
        }
        guard
            authProviders.indices.contains(clientAlgorithmIndex - 1),
            authVerifiers.indices.contains(serverAlgorithmIndex - 1)
        else {
            Log.error("[Handshake] Invalid auth algorithm requested")
            throw .cryptoError(
                errorCode: .tlsIllegalParameter,
                reasonString: "Invalid auth algorithm requested",
                underlying: HandshakeError.malformedRecord(lastRecord)
            )
        }
        let chosenProvider = authProviders[clientAlgorithmIndex - 1]
        let chosenVerifier = authVerifiers[serverAlgorithmIndex - 1]

        // Use the chosen server algorithm to verify the server's identity
        try await verifyIdentity(verifier: chosenVerifier)

        // Then use the chosen client algorithm to attest the client's identity
        try await attestIdentity(provider: chosenProvider)

        // Now that the handshake is complete, calculate the app secrets
        let appPeerSecrets = rootSecret.expandPeerSecrets(type: .app, transcriptHash: transcriptHasher.finalize())
        try updateTxKey(appPeerSecrets.clientSecret.expandKeys(securityLevel: .app))
        try updateRxKey(appPeerSecrets.serverSecret.expandKeys(securityLevel: .app))

        // Spin off a new task to save the keys so that we can start sending data as soon as possible
        Task {
            await chosenProvider.onHandshakeComplete()
            await chosenVerifier.onHandshakeComplete()
        }

        Log.info("[Handshake] Final key update issued, handshake is complete")
        // Handshake is now complete. Caller is now responsible for calling handleKeyUpdates
        return appPeerSecrets
    }

    /**
     Uses the auth verifier to verify the remote peer's identity.

     Receives and verifies the auth share, auth verify, and finished records in that order
     */
    func verifyIdentity(verifier: any HandshakeAuthVerifier) async throws(QLICConnectionError) {
        Log.info("[Handshake] Verifying peer identity, waiting for authentication share")
        let shareHash = transcriptHasher.finalize()
        guard case let .authenticationShare(shareData: shareData) = try await receiveHandshakeRecord() else {
            Log.error("[Handshake] Received unexpected record \(String(describing: lastRecord))")
            throw unexpectedCryptoRecordError("auth share")
        }
        do {
            try await verifier.verify(shareData: shareData, transcriptHash: Data(shareHash))
        } catch {
            Log.error("[Handshake] Could not verify authentication share data: \(error)")
            throw error
        }

        Log.info("[Handshake] Authentication share data verified, waiting for authentication verify")
        let verifyHash = transcriptHasher.finalize()
        guard case let .authenticationVerify(signature: signature) = try await receiveHandshakeRecord() else {
            Log.error("[Handshake] Received unexpected record \(String(describing: lastRecord))")
            throw unexpectedCryptoRecordError("auth verify")
        }
        do {
            try await verifier.verify(signature: signature, transcriptHash: Data(verifyHash))
        } catch {
            Log.error("[Handshake] Could not verify authentication verify signature: \(error)")
            throw error
        }

        Log.info("[Handshake] Peer identity successfully verified")
    }

    /**
     Uses the auth provider to attest the local peer's identity

     Creates and sends the auth share, auth verify, and finished records
     */
    func attestIdentity(provider: any HandshakeAuthProvider) async throws(QLICConnectionError) {
        Log.info("[Handshake] Attesting local identity, sending authentication share")
        let shareData: AuthenticationShareData
        do {
            shareData = try await provider.makeShareData(transcriptHash: Data(transcriptHasher.finalize()))
        } catch {
            throw .cryptoError(
                errorCode: .tlsInternalError,
                reasonString: "Failed to generate share data",
                underlying: error
            )
        }
        try sendCryptoFrame(record: .authenticationShare(shareData: shareData))

        Log.info("[Handshake] Authentication share sent, sending authentication verify")
        let signature: Data
        do {
            signature = try await provider.makeVerifySignature(transcriptHash: Data(transcriptHasher.finalize()))
        } catch {
            throw .cryptoError(
                errorCode: .tlsInternalError,
                reasonString: "Failed to generate signature",
                underlying: error
            )
        }
        try sendCryptoFrame(record: .authenticationVerify(signature: signature), signalsKeyUpdate: true)

        Log.info("[Handshake] Local identity successfully attested")
    }

    /**
     Processes incoming key update requests and records once the handshake is complete
     */
    func handleKeyUpdates<H: HashFunction>(
        txSecret: consuming PeerTrafficSecret<H>,
        rxSecret: consuming PeerTrafficSecret<H>
    ) async throws(QLICConnectionError) {
        var isKeyUpdateInProgress = false
        while true {
            while let record = try dequeueHandshakeRecord()?.record {
                guard case let .keyUpdate(updateRequested: updateRequested) = record else {
                    throw unexpectedCryptoRecordError("key update")
                }
                rxSecret.update()
                try updateRxKey(rxSecret.expandKeys(securityLevel: .app))
                if updateRequested {
                    isKeyUpdateInProgress = true
                    try sendCryptoFrame(record: .keyUpdate(updateRequested: false), signalsKeyUpdate: true)
                    txSecret.update()
                    try updateTxKey(txSecret.expandKeys(securityLevel: .app))
                } else {
                    isKeyUpdateInProgress = false
                }
            }
            switch try await receiveEvent() {
            case let .cryptoFrame(bytes):
                try ingestCryptoBytes(bytes)
            case .keyUpdateRequested:
                guard !isKeyUpdateInProgress else { break }
                isKeyUpdateInProgress = true
                try sendCryptoFrame(record: .keyUpdate(updateRequested: true), signalsKeyUpdate: true)
                txSecret.update()
                try updateTxKey(txSecret.expandKeys(securityLevel: .app))
            }
        }
    }
}
