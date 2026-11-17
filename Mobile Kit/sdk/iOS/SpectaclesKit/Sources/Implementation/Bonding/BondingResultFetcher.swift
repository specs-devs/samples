// Copyright © 2024 Snap, Inc. All rights reserved.

import Combine
import UIKit

enum BondingResultFetcherError: Error {
    case spectaclesAppNotInstalled
    case openDeeplinkFailed
    case invalidDeeplinkFormat
    case timeout
    /// The Specs app's UI explicitly rejected the bind/unbind.
    case userDenied
    /// No Snap user is logged into the Specs app, or the app's state isn't ready.
    case notAuthenticated
    /// No paired Spectacles, no active device, or — on unbind — the active device doesn't match the bonding.
    case missingDevice
    /// RPC to the Spectacles device failed or timed out.
    case networkingError
    /// Required URL parameters were missing or malformed on the request side.
    case invalidParams
    /// `action` query item was missing or unrecognized.
    case unsupportedAction
    /// Catch-all for inconsistent / racy / programmer-error states reported by the Specs app.
    case internalError
}

final class BondingResultFetcher: Sendable {
    enum ActionType: Sendable {
        case bind(lensId: String?, lensName: String?)
        case unbind(deviceId: String, bondingId: String)

        var valueString: String {
            switch self {
            case .bind:
                return "bind"
            case .unbind:
                return "unbind"
            }
        }
    }

    private let spectaclesAppScheme = "specs"
    private let spectaclesAppHost = "specs-mobile-kit"
    private let timeOutSeconds = 60
    private let clientId: ClientIdentifier
    private let redirectBaseURL: URL
    @MainActor private var urlHandler: UIApplication {
        return UIApplication.shared
    }

    init(clientId: ClientIdentifier, redirectBaseURL: URL) {
        self.clientId = clientId
        self.redirectBaseURL = redirectBaseURL
    }

    @MainActor
    private func createURL(action: ActionType) async -> URL? {
        guard let appId = await teamPrefixedApplicationIdentifier else {
            return nil
        }
        var components = URLComponents()
        components.scheme = spectaclesAppScheme
        components.host = spectaclesAppHost

        // Common to both actions: action discriminator, where to send the response, and the calling app's identity.
        var items: [URLQueryItem] = [
            URLQueryItem(name: "action", value: action.valueString),
            URLQueryItem(name: "redirectUrl", value: redirectBaseURL.absoluteString),
            URLQueryItem(name: "appId", value: appId),
        ]
        switch action {
        case let .bind(lensId, lensName):
            items.append(URLQueryItem(name: "clientId", value: clientId.clientId))
            items.append(URLQueryItem(name: "appName", value: clientId.appName))
            if let lensId {
                items.append(URLQueryItem(name: "lensId", value: lensId))
            }
            if let lensName {
                items.append(URLQueryItem(name: "lensName", value: lensName))
            }
            if let appIcon = clientId.appIcon {
                items.append(URLQueryItem(name: "appIcon", value: appIcon))
            }
        case let .unbind(deviceId, bondingId):
            items.append(URLQueryItem(name: "bondingId", value: bondingId))
            items.append(URLQueryItem(name: "deviceId", value: deviceId))
        }
        components.queryItems = items

        guard let url = components.url else {
            return nil
        }
        if urlHandler.canOpenURL(url) {
            return url
        } else {
            return nil
        }
    }

    private func checkStatus(queryItems: [URLQueryItem]) throws {
        guard let status = queryItems.first(where: { $0.name == "status" })?.value else {
            throw BondingResultFetcherError.invalidDeeplinkFormat
        }
        switch status {
        case "success": return
        case "userDenied": throw BondingResultFetcherError.userDenied
        case "notAuthenticated": throw BondingResultFetcherError.notAuthenticated
        case "missingDevice": throw BondingResultFetcherError.missingDevice
        case "networkingError": throw BondingResultFetcherError.networkingError
        case "invalidParams": throw BondingResultFetcherError.invalidParams
        case "unsupportedAction": throw BondingResultFetcherError.unsupportedAction
        case "internalError": throw BondingResultFetcherError.internalError
        default: throw BondingResultFetcherError.internalError
        }
    }

    private func resolveBindURL(_ url: URL, lensId: String?) throws -> SpectaclesBonding {
        // <baseURL>?action=bind&status=…&bondingId=…&peripheralId=…&deviceId=…
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let queryItems = components.queryItems
        else {
            throw BondingResultFetcherError.invalidDeeplinkFormat
        }
        try checkStatus(queryItems: queryItems)

        // Extract values from the query parameters
        func getQueryValue(for name: String) -> String? {
            return queryItems.first(where: { $0.name == name })?.value
        }

        guard
            let peripheralIdString = getQueryValue(for: BondingIdentifier.Keys.peripheralId.rawValue),
            let assignedId = getQueryValue(for: BondingIdentifier.Keys.assignedId.rawValue),
            let deviceId = getQueryValue(for: "deviceId")
        else {
            throw BondingResultFetcherError.invalidDeeplinkFormat
        }

        guard let peripheralId = UUID(uuidString: peripheralIdString) else {
            throw BondingResultFetcherError.invalidDeeplinkFormat
        }

        let identifier = BondingIdentifier(assignedId: assignedId, peripheralId: peripheralId)
        guard let id = try? BondingIdentifierSerializer().serialize(source: identifier) else {
            throw BondingResultFetcherError.invalidDeeplinkFormat
        }

        let bonding = SpectaclesBonding(
            id: id,
            identifier: identifier,
            deviceId: deviceId,
            lensId: lensId,
            publicKey: nil,
            keyAlgorithm: nil
        )
        return bonding
    }

    private func resolveUnBindURL(_ url: URL) throws {
        // <baseURL>?action=unbind&status=…
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let queryItems = components.queryItems
        else {
            throw BondingResultFetcherError.invalidDeeplinkFormat
        }
        try checkStatus(queryItems: queryItems)
    }

    @MainActor
    private func performDeeplink(request: URL, deeplinkAsyncStream: AsyncStream<URL>) async throws -> URL {
        Log.info("Deeplinking to Spectacles app with url: \(request)")
        guard await urlHandler.open(request) else {
            throw BondingResultFetcherError.openDeeplinkFailed
        }
        Log.info("Deeplinked to Spectacles app, waiting for response")

        let fetchTask = Task {
            for await url in deeplinkAsyncStream {
                Log.info("Deeplink response received: \(url)")
                return url
            }
            Log.info("Timed out waiting for deeplink response")
            throw BondingResultFetcherError.timeout
        }

        let timeoutTask = Task {
            try await Task.sleep(nanoseconds: UInt64(timeOutSeconds) * NSEC_PER_SEC)
            fetchTask.cancel()
        }
        defer { timeoutTask.cancel() }
        return try await fetchTask.value
    }

    @MainActor
    func unbind(bonding: SpectaclesBonding, deeplinkAsyncStream: AsyncStream<URL>) async throws {
        guard
            let request = await createURL(action: .unbind(
                deviceId: bonding.deviceId,
                bondingId: bonding.identifier.assignedId
            ))
        else {
            throw BondingResultFetcherError.openDeeplinkFailed
        }

        let response = try await performDeeplink(request: request, deeplinkAsyncStream: deeplinkAsyncStream)
        try resolveUnBindURL(response)
    }

    @MainActor
    func bind(request: BondingRequest, deeplinkAsyncStream: AsyncStream<URL>) async throws -> SpectaclesBonding {
        let (lensId, lensName): (String?, String?) = try {
            switch request {
            case .singleLens(let id): return (id, nil)
            case .singleLensByName(let name): return (nil, name)
            @unknown default: throw BondingResultFetcherError.spectaclesAppNotInstalled
            }
        }()

        guard let request = await createURL(action: .bind(lensId: lensId, lensName: lensName)) else {
            throw BondingResultFetcherError.spectaclesAppNotInstalled
        }

        let response = try await performDeeplink(request: request, deeplinkAsyncStream: deeplinkAsyncStream)
        return try resolveBindURL(response, lensId: lensId)
    }
}
