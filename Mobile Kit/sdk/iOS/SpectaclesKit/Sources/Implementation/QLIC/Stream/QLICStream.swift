// Copyright © 2024 Snap, Inc. All rights reserved.

import Foundation

/**
 Single stream being multiplexed over a QLIC connection.

 All mutable state is implicitly isolated to the parent `StreamEngine`. Accessing that mutable state outside of the engine's isolation context may lead to race conditions and undefined behavior.
 */
final class QLICStream: @unchecked Sendable {
    /// Struct representing an outstanding receive attempt
    private struct ReceiveOperation {
        /// Logging identifier for this operation
        let id: Int
        /// Acceptable range of bytes that can be used to complete this receive operation
        let range: Range<Int>
        /// The promise to yield the result into.
        let promise: Future<Result<Data, QLICStreamError>>.Promise
    }

    /// Current state of a stream half
    private enum State {
        /// Open for I/O
        case open
        /// Closed by some sort of error
        case closed(QLICStreamError)

        var error: QLICStreamError? {
            switch self {
            case .open: nil
            case let .closed(qlicStreamError): qlicStreamError
            }
        }
    }

    /// The engine that processes this stream
    let engine: StreamEngine
    /// The stream ID
    let streamId: Int

    // TODO: Add some sort of reusable discontiguous data struct
    /// Data sent by the peer that hasn't been received by the app layer yet
    private var pendingReadData = Data()
    /// Data sent by the app that hasn't been packetized and sent over the wire yet
    private var pendingWriteData = [Data]()

    /// List of pending receive operations
    private var queuedReceives = [ReceiveOperation]()
    /// Id to use for the next receive operation
    private var nextReceiveId = 0

    // TODO: Support unidirectional streams
    /// State of read half of the stream
    private var readState = State.open
    /// State of write half of the stream
    private var writeState = State.open

    /// Whether we should forcibly send a stream frame even if we have no data
    private var forceSendNextFrame: Bool

    /// Returns true if the stream is open or we have pending data
    var canRead: Bool {
        get async {
            await withEngineIsolation { _ in
                switch readState {
                case .open: true
                case .closed: !pendingReadData.isEmpty
                }
            }
        }
    }

    var readCloseError: QLICStreamError? {
        get async {
            await withEngineIsolation { _ in readState.error }
        }
    }

    var writeCloseError: QLICStreamError? {
        get async {
            await withEngineIsolation { _ in writeState.error }
        }
    }

    var readQueueCount: Int {
        get async {
            await withEngineIsolation { _ in pendingReadData.count }
        }
    }

    var writeQueueCount: Int {
        get async {
            await withEngineIsolation { _ in pendingWriteData.reduce(0) { $0 + $1.count } }
        }
    }

    init(engine: StreamEngine, streamId: Int, sendEmptyFirstFrame: Bool) {
        self.engine = engine
        self.streamId = streamId
        self.forceSendNextFrame = sendEmptyFirstFrame
    }

    /// Runs an operation with the engine's isolation
    private func withEngineIsolation<Success: Sendable, Failure>(handler: @Sendable (isolated StreamEngine) async throws(Failure) -> Success) async throws(Failure) -> Success {
        try await handler(engine)
    }

    /// Checks to ensure that we're running synchronous methods with the engine's isolation
    private func preconditionIsolated() {
        if #available(iOS 17.0, *) {
            engine.preconditionIsolated()
        }
    }

    /// Checks if we can have enough bytes to fulfill a receive request
    private func dequeueReceiveResult(receiveId: Int, range: Range<Int>) -> Result<Data, QLICStreamError>? {
        preconditionIsolated()
        if pendingReadData.count >= range.upperBound - 1 {
            let content = try! pendingReadData.dequeueData(count: range.upperBound - 1)
            Log.debug("[Stream \(streamId)] Fulfilling receive \(receiveId) with max count \(content.count). \(pendingReadData.count) bytes left in queue")
            return .success(content)
        }
        switch readState {
        case .open:
            if pendingReadData.count >= range.lowerBound {
                let content = pendingReadData
                pendingReadData = Data()
                Log.debug("[Stream \(streamId)] Fulfilling receive \(receiveId) with \(content.count) bytes. \(pendingReadData.count) bytes left in queue")
                return .success(content)
            } else {
                Log.debug("[Stream \(streamId)] Pending data insufficient to fulfill receive \(receiveId): \(pendingReadData.count) < \(range.lowerBound)")
                return nil
            }
        case .closed(.streamClosed):
            let content = pendingReadData
            pendingReadData = Data()
            if content.isEmpty {
                return .failure(.streamClosed)
            }
            if content.count < range.lowerBound {
                Log.debug("[Stream \(streamId)] Fulfilling receive \(receiveId) with short count on closed stream: \(content)")
            } else {
                Log.debug("[Stream \(streamId)] Fulfilling receive \(receiveId) on closed stream: \(content)")
            }
            return .success(content)
        case let .closed(error):
            Log.debug("[Stream \(streamId)] Fulfilling receive \(receiveId) with error: \(error)")
            return .failure(error)
        }
    }

    // MARK: - External API

    /**
     Enqueues some data for sending

     Returns immediately once data is appended to internal buffers. Does not wait for the data to be sent over the wire or acknowledged before returning.
     */
    func send(content: Data) async throws(QLICStreamError) {
        try await withEngineIsolation { engine throws(QLICStreamError) in
            switch writeState {
            case .open:
                pendingWriteData.append(content)
                Log.debug("[Stream \(streamId)] Sending \(content.count) bytes. \(pendingWriteData.reduce(0) { $0 + $1.count }) bytes queued")
                engine.writeStreamHasMoreData(streamId: streamId, bytes: content.count)
            case let .closed(error):
                Log.debug("[Stream \(streamId)] Sending on closed stream with error \(error)")
                throw error
            }
        }
    }

    struct IntCollection: Collection {
        public let startIndex = 0
        public let endIndex = Int.max
        public func index(after i: Int) -> Int { i + 1 }
        public subscript(position: Int) -> Int { position }
    }

    /**
     Attempts to receive some data
     - parameter range: Range specifying size of data to receive. May be ignored if the connection is closed
     */
    func receive(range: some RangeExpression<Int>) async throws(QLICStreamError) -> Data {
        let range = range.relative(to: IntCollection())
        return try await withEngineIsolation { engine in
            let receiveId = nextReceiveId
            nextReceiveId += 1
            Log.debug("[Stream \(streamId)] Receiving data in range \(range) for id: \(receiveId)")
            if queuedReceives.isEmpty, let ret = dequeueReceiveResult(receiveId: receiveId, range: range) {
                return ret
            }

            Log.debug("[Stream \(streamId)] Enqueueing receive operation for id: \(receiveId)")
            return await Future {
                queuedReceives.append(ReceiveOperation(id: receiveId, range: range, promise: $0))
            }.value
        }.get()
    }

    /**
     Closes the stream for reading.

     Pending read data will be discarded and all outstanding receives will fail
     */
    func closeForReading(applicationErrorCode: Int) async {
        await withEngineIsolation { engine in
            if closeForReading(error: .streamAborted(errorCode: applicationErrorCode)) {
                engine.streamDidCloseForReading(streamId: streamId, applicationErrorCode: applicationErrorCode)
            }
        }
    }

    /**
     Closes the stream for writing.

     If an error code is provided, this indicates an abnormal termination and will cause pending writes to be discarded. Otherwise, pending writes will be sent before the stream is fully closed.

     If a stream is closed normally, it can be closed again with an error code to force pending data to be discarded.
     */
    func closeForWriting(applicationErrorCode: Int? = nil) async {
        await withEngineIsolation { engine in
            let error = if let applicationErrorCode {
                QLICStreamError.streamAborted(errorCode: applicationErrorCode)
            } else {
                QLICStreamError.streamClosed
            }
            if closeForWriting(error: error) {
                engine.streamDidCloseForWriting(streamId: streamId, applicationErrorCode: applicationErrorCode)
            }
        }
    }

    // MARK: - Engine API

    /// Closes the stream for reading, returning whether the stream engine should be informed
    func closeForReading(error: QLICStreamError) -> Bool {
        preconditionIsolated()
        switch readState {
        case .open:
            Log.debug("[Stream \(streamId)] Clearing read buffer on close with error \(error)")
            readState = .closed(error)
            pendingReadData.removeAll()
            for receive in queuedReceives {
                Log.debug("[Stream \(streamId)] Fulfilling receive \(receive.id) with error \(error)")
                receive.promise.complete(returning: .failure(error))
            }
            queuedReceives.removeAll()
            return true
        case .closed(.streamClosed):
            if pendingReadData.isEmpty {
                Log.debug("[Stream \(streamId)] Ignoring close for reading attempt on fully closed stream")
            } else {
                Log.debug("[Stream \(streamId)] Clearing read buffer on close with error \(error)")
                readState = .closed(error)
                pendingReadData.removeAll()
            }
            return false
        case .closed:
            return false
        }
    }

    /// Closes the stream for writing, returning whether the stream engine should be informed
    func closeForWriting(error: QLICStreamError) -> Bool {
        preconditionIsolated()
        switch writeState {
        case .open:
            if case .streamClosed = error {
                Log.debug("[Stream \(streamId)] Gracefully closing stream while keeping write buffer")
            } else {
                Log.debug("[Stream \(streamId)] Clearing write buffer on close with error \(error)")
                pendingWriteData.removeAll()
            }
            writeState = .closed(error)
            return true
        case .closed(.streamClosed):
            if case .streamClosed = error {
                Log.debug("[Stream \(streamId)] Ignoring duplicate write close event")
                return false
            } else {
                Log.debug("[Stream \(streamId)] Clearing write buffer on close with error \(error)")
                pendingWriteData.removeAll()
                writeState = .closed(error)
                return true
            }
        case .closed:
            return false
        }
    }

    /// Called when an incoming reset stream frame is received
    func onResetStream(applicationErrorCode: Int) {
        preconditionIsolated()
        _ = closeForReading(error: .streamAborted(errorCode: applicationErrorCode))
    }

    /// Called when an incoming stream frame is received
    func onStream(data: Data, fin: Bool) {
        preconditionIsolated()
        pendingReadData += data
        Log.debug("[Stream \(streamId)] Received \(data.count) bytes. Total queued count is \(pendingReadData.count)")
        if fin {
            readState = .closed(.streamClosed)
        }
        while
            let queuedReceive = queuedReceives.first,
            let result = dequeueReceiveResult(receiveId: queuedReceive.id, range: queuedReceive.range)
        {
            queuedReceive.promise.complete(returning: result)
            queuedReceives.removeFirst()
        }
    }

    /// Called when an ack for previously sent data is received
    func onAck(size: Int, fin: Bool) {
        preconditionIsolated()
    }

    /// Called when an incoming stop sending frame is received
    func onStopSending(applicationErrorCode: Int) {
        preconditionIsolated()
        _ = closeForWriting(error: .streamAborted(errorCode: applicationErrorCode))
    }

    /// Dequeue a certain amount of data for sending
    func dequeuePendingData(maxCount: Int) -> (data: Data, endsOnMessageBoundary: Bool) {
        preconditionIsolated()
        forceSendNextFrame = false
        if let first = pendingWriteData.first, first.count > maxCount {
            let data = try! pendingWriteData[0].dequeueData(count: maxCount)
            Log.debug("[Stream \(streamId)] Dequeued \(data.count) bytes to send. Total queued count is \(pendingReadData.count)")
            return (data, false)
        }
        var ret = Data()
        while let first = pendingWriteData.first, ret.count + first.count <= maxCount {
            ret += first
            pendingWriteData.removeFirst()
        }
        Log.debug("[Stream \(streamId)] Dequeued \(ret.count) bytes to send. Total queued count is \(pendingReadData.count)")
        return (ret, true)
    }

    /// Returns whether the stream has any pending data to write
    func hasPendingWriteData() -> Bool {
        preconditionIsolated()
        if case .open = writeState {
            return forceSendNextFrame || !pendingWriteData.isEmpty
        }
        return true
    }

    /// Returns whether the stream is closed and has no more pending data
    func isWritingFinished() -> Bool {
        preconditionIsolated()
        if case .open = writeState {
            return false
        }
        return pendingWriteData.isEmpty
    }
}
