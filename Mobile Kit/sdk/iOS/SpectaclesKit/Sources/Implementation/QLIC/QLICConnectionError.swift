// Copyright © 2025 Snap, Inc. All rights reserved.

import Foundation

/**
 Error type indicating that a stream is closed for some reason and cannot perform any more i/o
 */
enum QLICStreamError: Error {
    /**
     Indicates the stream was closed gracefully and all buffered data has been delivered
     */
    case streamClosed
    /**
     Indicates the stream was forcibly aborted at the application layer with the given error code
     */
    case streamAborted(errorCode: Int)
    /**
     Indicates the stream underlying QLIC connection was closed
     */
    case connectionClosed(QLICConnectionError)
}

/**
 Error type indicating that the entire QLIC connection has been closed
 */
enum QLICConnectionError: Error {
    /// Indicates the remote application requested the connection to close
    case remoteAppError(errorCode: Int, reason: Data)

    /// Indicates the remote QLIC implementation encountered a protocol error
    case remoteProtocolError(errorCode: Int, reason: Data, frameType: Int)

    /// Indicates the local application requested the connection to close
    case localAppError(errorCode: Int, reason: Data)

    /// Indicates the local QLIC implementation encountered a protocol error
    case localProtocolError(errorCode: Int, reason: Data, frameType: Int, underlying: any Error)

    /// Indicates the local QLIC implementation encountered an irrecoverable runtime error
    case runtimeError(any Error)

    var description: String {
        let encodeReason = { reason in
            if let decoded = String(data: reason, encoding: .utf8) {
                "\"\(decoded)\""
            } else {
                reason.base64EncodedString()
            }
        }
        let encodeProtocolErrorCode = { errorCode in
            if let protocolErrorCode = QLICProtocolErrorCode(rawValue: errorCode) {
                "\(protocolErrorCode)"
            } else {
                "\(errorCode)"
            }
        }
        switch self {
        case let .remoteAppError(errorCode, reason):
            return "QLICConnectionError.remoteAppError(errorCode: \(errorCode), reason: \(encodeReason(reason)))"
        case let .remoteProtocolError(errorCode, reason, frameType):
            return "QLICConnectionError.remoteProtocolError(errorCode: \(encodeProtocolErrorCode(errorCode)), reason: \(encodeReason(reason)), frameType: \(frameType))"
        case let .localAppError(errorCode, reason):
            return "QLICConnectionError.localAppError(errorCode: \(errorCode), reason: \(encodeReason(reason)))"
        case let .localProtocolError(errorCode, reason, frameType, underlying):
            return "QLICConnectionError.localProtocolError(errorCode: \(encodeProtocolErrorCode(errorCode)), reason: \(encodeReason(reason)), frameType: \(frameType), underlying: \(underlying))"
        case let .runtimeError(error):
            return "QLICConnectionError.runtimeError(\(error))"
        }
    }
}

/**
 Base error codes taken from the QUIC specification

 The first set of error codes correspond to transport errors as defined in the QUIC specification
 See https://www.rfc-editor.org/rfc/rfc9000.html#name-transport-error-codes

 The second set of error codes correspond to TLS 1.3 fatal alerts, taken by adding 0x100 to the alert value
 See https://www.rfc-editor.org/rfc/rfc8446#section-6
 */
enum QLICProtocolErrorCode: Int {
    case noError = 0x00
    case internalError = 0x01
    case connectionRefused = 0x02
    case flowControlError = 0x03
    case streamLimitError = 0x04
    case streamStateError = 0x05
    case finalSizeError = 0x06
    case frameEncodingError = 0x07
    case transportParameterError = 0x08
    case connectionIdLimitError = 0x09
    case protocolViolation = 0x0A
    case invalidToken = 0x0B
    case applicationError = 0x0C
    case cryptoBufferExceeded = 0x0D
    case keyUpdateError = 0x0E
    case aeadLimitReached = 0x0F
    case noViablePath = 0x10
    case tlsUnexpectedMessage = 0x10A
    case tlsBadRecordMac = 0x114
    case tlsRecordOverflow = 0x116
    case tlsHandshakeFailure = 0x128
    case tlsBadCertificate = 0x12A
    case tlsUnsupportedCertificate = 0x12B
    case tlsCertificateRevoked = 0x12C
    case tlsCertificateExpired = 0x12D
    case tlsCertificateUnknown = 0x12E
    case tlsIllegalParameter = 0x12F
    case tlsUnknownCa = 0x130
    case tlsAccessDenied = 0x131
    case tlsDecodeError = 0x132
    case tlsDecryptError = 0x133
    case tlsProtocolVersion = 0x146
    case tlsInsufficientSecurity = 0x147
    case tlsInternalError = 0x150
    case tlsInappropriateFallback = 0x156
    case tlsUserCancelled = 0x15A
    case tlsMissingExtension = 0x16D
    case tlsUnsupportedExtension = 0x16E
    case tlsUnrecognizedName = 0x170
    case tlsBadCertificateStatusResponse = 0x171
    case tlsUnknownPskIdentity = 0x173
    case tlsCertificateRequired = 0x174
    case tlsNoApplicationProtocol = 0x178
}
