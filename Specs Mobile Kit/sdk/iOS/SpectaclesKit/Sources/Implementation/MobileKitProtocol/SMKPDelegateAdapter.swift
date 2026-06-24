// Copyright © 2024 Snap, Inc. All rights reserved.

import CryptoKit
import Foundation

actor SMKPDelegateAdapter {
    let bonding: SpectaclesBonding
    let sessionRequest: SessionRequest
    let authRepository: KeychainAuthRepository
    let runloop: QLICRunLoop
    let handlerFactory: (SMKPMessage.RequestType) throws -> any SMKPMessageHandler

    var attestHandler: SMKPAttestRequestHandler

    init(
        bonding: SpectaclesBonding,
        sessionRequest: SessionRequest,
        authRepository: KeychainAuthRepository,
        runloop: QLICRunLoop,
        handlerFactory: @escaping (SMKPMessage.RequestType) throws -> any SMKPMessageHandler
    ) {
        self.bonding = bonding
        self.sessionRequest = sessionRequest
        self.authRepository = authRepository
        self.runloop = runloop
        self.handlerFactory = handlerFactory
        self.attestHandler = SMKPAttestRequestHandler(
            expectedLensId: bonding.lensId,
            acceptUntrustedLenses: sessionRequest.acceptUntrustedLenses
        )
    }

    func run() async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await self.runloop.run()
            }
            group.addTask {
                let authVerifiers = await self.authRepository.loadAuthVerifiers(
                    isClient: true,
                    acceptUnfusedSpectacles: self.sessionRequest.acceptUnfusedSpectacles
                )
                let authProviders = await self.authRepository.loadAuthProviders(isClient: true)
                let secrets = try await self.runloop.runHandshake(
                    authVerifiers: authVerifiers,
                    authProviders: authProviders
                )
                await self.runloop.runKeyUpdates(secrets: secrets)
            }
            group.addTask {
                while let stream = try? await self.runloop.streamEngine.acceptStream(streamId: nil) {
                    Task {
                        await self.handleStream(stream)
                    }
                }
            }

            while !group.isEmpty {
                try await group.next()
            }
        }
    }

    private func handleStream(_ stream: QLICStream) async {
        Log.print("[streamId]:\(stream.streamId)")
        do {
            let firstMessage = try await SMKPMessage.receiveMessage(from: stream)
            if try attestHandler.handleFirstMessage(firstMessage) {
                try await stream.send(content: SMKPMessage(
                    startLine: .response(type: .response, status: 0),
                    body: Data()
                ).encode())
            } else {
                try await handleMessage(firstMessage, stream)
            }
            while await stream.canRead {
                try await handleMessage(SMKPMessage.receiveMessage(from: stream), stream)
            }
            await stream.closeForWriting()
        } catch {
            Log.print("[streamId]:\(stream.streamId) handleContent error:\(error)")
            await stream.closeForReading(applicationErrorCode: SpectaclesRequestError.badRequest.rawValue)
            await stream.closeForWriting(applicationErrorCode: SpectaclesRequestError.serverError.rawValue)
        }
    }

    private func handleMessage(_ message: SMKPMessage, _ stream: QLICStream) async throws {
        Log.print("[streamId]:\(stream.streamId) receive:\(message)")
        switch message.startLine {
        case let .request(type, path):
            let handler = try handlerFactory(type)
            try await handler.handleMessage(message, path, stream)
        case .response:
            // TODO: handle response
            return
        }
    }
}
