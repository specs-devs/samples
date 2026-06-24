// Copyright © 2024 Snap, Inc. All rights reserved.

import CryptoKit
import Foundation

/**
 Lazily derives the host's team-prefixed application identifier.

 iOS has no public API that returns the team id at runtime, so we probe for it by adding a placeholder generic-password item to the keychain without an explicit `kSecAttrAccessGroup`. The default access group the system assigns has the form `<TEAM_ID>.<bundle-id>`, which we read back via the `Keychain` wrapper. The runtime initializes this `let` lazily on first access, so the keychain I/O happens at most once per process.
 */
@SecurityActor
let teamPrefixedApplicationIdentifier: String? = {
    guard let bundleId = Bundle.main.bundleIdentifier else { return nil }
    let account = "spectacles-kit-app-identifier-probe"
    let readAccessGroup = { (try? Keychain.copyItemAccessGroup(account: account)) ?? nil }
    if readAccessGroup() == nil {
        try? Keychain.addItem(account: account, data: Data([0]))
    }
    // Trailing component may be a custom keychain-access-groups entry rather than the bundle id, so pair the team-id prefix with `Bundle.main.bundleIdentifier`.
    guard let teamId = readAccessGroup()?.split(separator: ".", maxSplits: 1).first else { return nil }
    return "\(teamId).\(bundleId)"
}()

/**
 Concrete `AuthRepository` backed by the iOS keychain and the kit's `BondingRepository`.

 Kit-specific implementation — does not exist in `specs-mobile-app`. The kit needs a real backing store for the abstract `AuthRepository` protocol, whereas the specs app supplies its own.
 */
@SecurityActor
final class KeychainAuthRepository: AuthRepository {
    /// Keychain account used to store the secure enclave private signing key
    static let signingKeyAccount = "SecureEnclave.P256.Signing.PrivateKey"

    enum AuthRepositoryError: Error {
        /// A required certificate wasn't found in the package bundle
        case certificateMissing
        /// A required certificate couldn't be decoded
        case certificateInvalid
        /// The device doesn't support SecureEnclave APIs
        case secureEnclaveUnsupported
    }

    /// The bonding for the current connection
    var bonding: SpectaclesBonding
    /// The bonding repository the bonding is stored in
    let bondingRepository: BondingRepository
    /// Resolved eagerly during init while we already hold the security actor, so that the protocol's nonisolated requirement is satisfied without crossing actor boundaries on every read.
    nonisolated let applicationId: String?
    /// Whether to accept unfused (dev-signed) Spectacles in addition to production-fused units
    let acceptUnfusedSpectacles: Bool

    init(
        bonding: SpectaclesBonding,
        bondingRepository: BondingRepository,
        acceptUnfusedSpectacles: Bool
    ) {
        self.bonding = bonding
        self.bondingRepository = bondingRepository
        self.acceptUnfusedSpectacles = acceptUnfusedSpectacles
        self.applicationId = teamPrefixedApplicationIdentifier
    }

    var signingPrivateKeys: [any P256SigningKey] {
        get async {
            guard
                SecureEnclave.isAvailable,
                let data = try? Keychain.copyItem(account: Self.signingKeyAccount),
                let signingKey = try? SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: data)
            else {
                return []
            }
            return [signingKey]
        }
    }

    func generateNewSigningKey() async throws -> (key: any P256SigningKey, saveOperation: @Sendable () async -> Void) {
        guard SecureEnclave.isAvailable else { throw AuthRepositoryError.secureEnclaveUnsupported }
        let signingKey = try SecureEnclave.P256.Signing.PrivateKey()
        let dataRepresentation = signingKey.dataRepresentation
        let saveOperation: @Sendable () async -> Void = {
            do {
                try await Keychain.addItem(account: Self.signingKeyAccount, data: dataRepresentation)
            } catch {
                Log.error("[KeychainAuthRepository] Failed to persist signing key: \(error)")
            }
        }
        return (signingKey, saveOperation)
    }

    var x963EncodedPretrustedPublicKeys: [Data] {
        get async {
            guard
                let key = bonding.publicKey,
                let data = try? key.copyExternalRepresentation()
            else {
                return []
            }
            return [data]
        }
    }

    func saveX963EncodedPretrustedPublicKey(_ data: Data) async {
        do {
            bonding.publicKey = try SecKey.create(data: data)
            bondingRepository.saveBonding(bonding: bonding)
        } catch {
            Log.error("[KeychainAuthRepository] Failed to save pretrusted public key: \(error)")
        }
    }

    var derEncodedRootCertData: [Data] {
        get async {
            var ret = [Data]()
            if let data = Self.loadCertData(name: "avalon_root") {
                ret.append(data)
            }
            if let data = Self.loadCertData(name: "stinson_root") {
                ret.append(data)
            }
            if acceptUnfusedSpectacles {
                if let data = Self.loadCertData(name: "avalon_dev_root") {
                    ret.append(data)
                }
                if let data = Self.loadCertData(name: "stinson_dev_root") {
                    ret.append(data)
                }
            }
            return ret
        }
    }

    private static func loadCertData(name: String) -> Data? {
        guard let url = Bundle.module.url(forResource: name, withExtension: "der") else { return nil }
        return try? Data(contentsOf: url)
    }
}
