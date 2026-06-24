// Copyright © 2025 Snap, Inc. All rights reserved.

import CryptoKit
import Foundation

/**
 An ECDSA signing key using the standard P-256 NIST curve.

 This is provided as a protocol to allow the client to select which secure-enclave backed signing key implementation they wish to use (eg SecureEnclave.P256.Signing.PrivateKey, SecKey w/ kSecAttrTokenIDSecureEnclave).
 */
protocol P256SigningKey: Sendable {
    /**
     x963-encoded data of the signing key's public key
     */
    var x963EncodedPublicKey: Data { get }

    /**
     DER-encoded signature of a message digest
     */
    func derEncodedSignature(for digest: some Digest) throws -> Data
}

extension SecureEnclave.P256.Signing.PrivateKey: P256SigningKey {
    var x963EncodedPublicKey: Data {
        publicKey.x963Representation
    }

    func derEncodedSignature(for digest: some Digest) throws -> Data {
        try signature(for: digest).derRepresentation
    }
}

extension P256.Signing.PrivateKey: P256SigningKey {
    var x963EncodedPublicKey: Data {
        publicKey.x963Representation
    }

    func derEncodedSignature(for digest: some Digest) throws -> Data {
        try signature(for: digest).derRepresentation
    }
}
