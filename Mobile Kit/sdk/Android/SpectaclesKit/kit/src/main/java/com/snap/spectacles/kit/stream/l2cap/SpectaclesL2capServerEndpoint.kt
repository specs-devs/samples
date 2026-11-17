package com.snap.spectacles.kit.stream.l2cap

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.annotation.RequiresPermission
import com.snap.spectacles.kit.stream.qlic.QlicEndpoint
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Represents an L2CAP server endpoint.
 */
@RequiresApi(Build.VERSION_CODES.Q)
data class SpectaclesL2capServerEndpoint(
    val device: BluetoothDevice,
    val psm: Int
) : QlicEndpoint {

    @RequiresPermission(value = Manifest.permission.BLUETOOTH_CONNECT)
    override fun connect(timeoutMs: Int): QlicEndpoint.Socket {
        val socket = device.createInsecureL2capChannel(psm)

        val executor = Executors.newSingleThreadExecutor()
        try {
            executor.submit(socket::connect).get(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        } catch (error: ExecutionException) {
            socket.close()
            throw error.cause ?: error
        } catch (error: Exception) {
            socket.close()
            throw error
        } finally {
            executor.shutdown()
        }

        return SpectaclesL2capEndpointSocket(socket)
    }
}
