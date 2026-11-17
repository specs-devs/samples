package com.snap.spectacles.kit.stream.qlic

import com.snap.spectacles.kit.KitBaseTest
import com.snap.spectacles.kit.stream.SpectaclesStreamDataUnit
import com.snap.spectacles.kit.stream.utils.SpectaclesStreamHandler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.clearInvocations
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

@RunWith(JUnit4::class)
class QlicStreamManagerTest : KitBaseTest() {

    private val flowControl: QlicFlowControl = mock<QlicFlowControl>()
    private val peerStreamHandler = mock<SpectaclesStreamHandler>()

    private var streamId: QlicStreamId = mock<QlicStreamId>()
    private val stream = mock<QlicStream> {
        on { streamId } doAnswer { streamId }
    }
    private val streamFactory: QlicStream.Factory = mock<QlicStream.Factory> {
        on { create(any(), any(), any(), any()) } doAnswer {
            streamId = it.getArgument(0)
            stream
        }
    }

    private val subject = QlicStreamManager(
        { peerStreamHandler },
        flowControl,
        true,
        streamFactory
    )

    @Test
    fun `openClientStream(), stream id increasing`() {
        subject.startLocalStream(true, mock(), mock())

        val captor = argumentCaptor<QlicStreamId>()
        verify(streamFactory).create(captor.capture(), any(), any(), eq(false))
        assertEquals(0, captor.firstValue.id)

        clearInvocations(streamFactory)
        subject.startLocalStream(true, mock(), mock())

        verify(streamFactory).create(captor.capture(), any(), any(), eq(false))
        assertEquals(1, captor.secondValue.id)
    }

    @Test
    fun `openClientStream(), unidirectional`() {
        subject.startLocalStream(true, mock(), mock())

        val captor = argumentCaptor<QlicStreamId>()
        verify(streamFactory).create(captor.capture(), any(), any(), eq(false))
        assertEquals(true, captor.firstValue.isUnidirectional)
    }

    @Test
    fun `openClientStream(), bidirectional`() {
        subject.startLocalStream(false, mock(), mock())

        val captor = argumentCaptor<QlicStreamId>()
        verify(streamFactory).create(captor.capture(), any(), any(), eq(false))
        assertEquals(false, captor.firstValue.isUnidirectional)
    }

    @Test
    fun `openClientStream(), client-initiated`() {
        subject.startLocalStream(false, mock(), mock())

        val captor = argumentCaptor<QlicStreamId>()
        verify(streamFactory).create(captor.capture(), any(), any(), eq(false))
        assertEquals(true, captor.firstValue.isClientInitiated)
    }

    @Test(expected = IllegalStateException::class)
    fun `openClientStream(), already shutdown`() {
        subject.shutdown()
        subject.startLocalStream(false, mock(), mock())
    }

    @Test
    fun `openClientStream(), non client-initiated`() {
        val serverSubject = QlicStreamManager(
            { peerStreamHandler },
            flowControl,
            false,
            streamFactory
        )
        serverSubject.startLocalStream(false, mock(), mock())

        val captor = argumentCaptor<QlicStreamId>()
        verify(streamFactory).create(captor.capture(), any(), any(), eq(false))
        assertEquals(false, captor.firstValue.isClientInitiated)
    }

    @Test
    fun `openClientStream(), onReceive`() {
        val onReceive = mock<(SpectaclesStreamDataUnit) -> Unit>()
        subject.startLocalStream(true, onReceive, mock())

        val captor = argumentCaptor<(SpectaclesStreamDataUnit) -> Unit>()
        verify(streamFactory).create(any(), captor.capture(), any(), eq(false))
        val data = mock<SpectaclesStreamDataUnit>()
        captor.firstValue.invoke(data)
        verify(onReceive).invoke(data)
    }

    @Test
    fun `openClientStream(), onClose`() {
        val onClose = mock<() -> Unit>()
        subject.startLocalStream(true, mock(), onClose)

        val captor = argumentCaptor<() -> Unit>()
        verify(streamFactory).create(any(), any(), captor.capture(), eq(false))
        captor.firstValue.invoke()
        verify(onClose).invoke()

        captor.firstValue.invoke()
    }

    @Test
    fun `openClientStream(), startedByPeer is false`() {
        subject.startLocalStream(true, mock(), mock())

        verify(streamFactory).create(any(), any(), any(), eq(false))
    }

    @Test
    fun `openClientStream(), attach to flowControl`() {
        subject.startLocalStream(true, mock(), mock())

        verify(stream).attach(flowControl)
    }

    @Test
    fun `handle(), stream first DATA`() {
        val frame = QlicFrame.StreamData(
            QlicStreamId.compact(11, 0, false, false),
            false,
            true,
            byteArrayOf(1, 2)
        )
        assertTrue(subject.handle(frame))

        val captor = argumentCaptor<QlicStreamId>()
        verify(streamFactory).create(captor.capture(), any(), any(), eq(true))
        assertEquals(11, captor.firstValue.id)
        assertEquals(0, captor.firstValue.urgency)
        assertEquals(false, captor.firstValue.isUnidirectional)
        assertEquals(false, captor.firstValue.isClientInitiated)
        verify(peerStreamHandler).onAttach(stream)
        verify(stream).handleIncomingFrame(frame)
    }

    @Test
    fun `handle(), stream non-first DATA`() {
        val frame1 = QlicFrame.StreamData(
            QlicStreamId.compact(11, 0, false, false),
            false,
            true,
            byteArrayOf(1, 2)
        )
        subject.handle(frame1)
        clearInvocations(streamFactory)
        clearInvocations(stream)

        val frame2 = QlicFrame.StreamData(
            QlicStreamId.compact(11, 7, false, false),
            false,
            true,
            byteArrayOf(1)
        )
        assertTrue(subject.handle(frame2))

        verify(streamFactory, never()).create(any(), any(), any(), any())
        verify(stream).handleIncomingFrame(frame2)
    }

    @Test
    fun `handle(), stream mismatched DATA`() {
        val frame = QlicFrame.StreamData(
            QlicStreamId.compact(11, 0, false, true),
            false,
            true,
            byteArrayOf(1, 2)
        )
        assertTrue(subject.handle(frame))

        verify(streamFactory, never()).create(any(), any(), any(), any())
    }

    @Test
    fun `handle(), stream DATA after closed`() {
        val frame = QlicFrame.StreamData(
            QlicStreamId.compact(11, 0, false, false),
            false,
            true,
            byteArrayOf(1, 2)
        )
        assertTrue(subject.handle(frame))

        val captor = argumentCaptor<() -> Unit>()
        verify(streamFactory).create(any(), any(), captor.capture(), eq(true))
        captor.firstValue.invoke()
        clearInvocations(streamFactory)
        clearInvocations(stream)

        assertTrue(subject.handle(frame))
        verify(streamFactory, never()).create(any(), any(), any(), any())
        verify(stream, never()).handleIncomingFrame(any())
    }

    @Test
    fun `handle(), stream RESET`() {
        val frame1 = QlicFrame.StreamData(
            QlicStreamId.compact(11, 0, false, false),
            false,
            true,
            byteArrayOf(1, 2)
        )
        subject.handle(frame1)
        clearInvocations(streamFactory)
        clearInvocations(stream)

        val frame2 = QlicFrame.StreamReset(
            QlicStreamId.compact(11, 7, false, false),
            0
        )
        assertTrue(subject.handle(frame2))

        verify(streamFactory, never()).create(any(), any(), any(), any())
        verify(stream).handleIncomingFrame(frame2)
    }

    @Test
    fun `handle(), stream RESET not-exists`() {
        val frame = QlicFrame.StreamReset(
            QlicStreamId.compact(11, 7, false, false),
            0
        )
        assertTrue(subject.handle(frame))

        verify(streamFactory, never()).create(any(), any(), any(), any())
    }

    @Test
    fun `handle(), stream STOP`() {
        val frame1 = QlicFrame.StreamData(
            QlicStreamId.compact(11, 0, false, false),
            false,
            true,
            byteArrayOf(1, 2)
        )
        subject.handle(frame1)
        clearInvocations(streamFactory)
        clearInvocations(stream)

        val frame2 = QlicFrame.StreamStopSending(
            QlicStreamId.compact(11, 7, false, false),
            0
        )
        assertTrue(subject.handle(frame2))

        verify(streamFactory, never()).create(any(), any(), any(), any())
        verify(stream).handleIncomingFrame(frame2)
    }

    @Test
    fun `handle(), stream STOP not-exists`() {
        val frame = QlicFrame.StreamStopSending(
            QlicStreamId.compact(11, 7, false, false),
            0
        )
        assertTrue(subject.handle(frame))

        verify(streamFactory, never()).create(any(), any(), any(), any())
    }

    @Test
    fun `handle(), non-stream`() {
        assertFalse(subject.handle(QlicFrame.Ack(10)))
    }

    @Test
    fun `shutdown(), empty`() {
        subject.shutdown()
    }

    @Test
    fun `shutdown(), not-empty`() {
        subject.startLocalStream(true, mock(), mock())
        subject.shutdown()

        verify(stream).shutdown(false)
    }

    @Test
    fun `ClosedStreamTombstones, e2e`() {
        val tombstones = QlicStreamManager.ClosedStreamTombstones(10)

        val streamId = QlicStreamId(1, 0, false, false)
        assertFalse(tombstones.contains(streamId))
        tombstones.add(streamId)
        assertTrue(tombstones.contains(streamId))

        for (i in 2..10) {
            tombstones.add(QlicStreamId(i, 0, false, false))
        }
        assertTrue(tombstones.contains(QlicStreamId(1, 0, false, false)))
        assertTrue(tombstones.contains(QlicStreamId(10, 0, false, false)))

        tombstones.add(QlicStreamId(1, 0, false, false))
        assertTrue(tombstones.contains(QlicStreamId(1, 0, false, false)))
        assertTrue(tombstones.contains(QlicStreamId(2, 0, false, false)))

        tombstones.add(QlicStreamId(11, 0, false, false))
        assertFalse(tombstones.contains(QlicStreamId(1, 0, false, false)))
        assertTrue(tombstones.contains(QlicStreamId(2, 0, false, false)))
    }

    // @Test
    fun `Factory create()`() {
        QlicStreamManager.Factory.create(mock(), mock(), true)
    }
}
