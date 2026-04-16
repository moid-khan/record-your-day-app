package com.recordyourday_app.handlandmarker

import android.graphics.Bitmap
import androidx.camera.core.ImageProxy

class YuvToRgbConverter {
    private var yBuffer: ByteArray? = null
    private var uBuffer: ByteArray? = null
    private var vBuffer: ByteArray? = null
    private var outBuffer: IntArray? = null

    fun yuvToRgb(image: ImageProxy, output: Bitmap) {
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        val yByteBuffer = yPlane.buffer
        val uByteBuffer = uPlane.buffer
        val vByteBuffer = vPlane.buffer

        yByteBuffer.rewind()
        uByteBuffer.rewind()
        vByteBuffer.rewind()

        val ySize = yByteBuffer.remaining()
        val uSize = uByteBuffer.remaining()
        val vSize = vByteBuffer.remaining()

        if (yBuffer == null || yBuffer!!.size < ySize) {
            yBuffer = ByteArray(ySize)
        }
        if (uBuffer == null || uBuffer!!.size < uSize) {
            uBuffer = ByteArray(uSize)
        }
        if (vBuffer == null || vBuffer!!.size < vSize) {
            vBuffer = ByteArray(vSize)
        }

        yByteBuffer.get(yBuffer!!, 0, ySize)
        uByteBuffer.get(uBuffer!!, 0, uSize)
        vByteBuffer.get(vBuffer!!, 0, vSize)

        val width = image.width
        val height = image.height
        val outSize = width * height
        if (outBuffer == null || outBuffer!!.size < outSize) {
            outBuffer = IntArray(outSize)
        }

        val yRowStride = yPlane.rowStride
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        var outIndex = 0
        for (row in 0 until height) {
            val yRowOffset = row * yRowStride
            val uvRowOffset = (row shr 1) * uvRowStride
            for (col in 0 until width) {
                val yIndex = yRowOffset + col
                val uvIndex = uvRowOffset + (col shr 1) * uvPixelStride

                var y = (yBuffer!![yIndex].toInt() and 0xff) - 16
                if (y < 0) y = 0
                val u = (uBuffer!![uvIndex].toInt() and 0xff) - 128
                val v = (vBuffer!![uvIndex].toInt() and 0xff) - 128

                val y1192 = 1192 * y
                var r = y1192 + 1634 * v
                var g = y1192 - 833 * v - 400 * u
                var b = y1192 + 2066 * u

                r = r.coerceIn(0, 262143)
                g = g.coerceIn(0, 262143)
                b = b.coerceIn(0, 262143)

                outBuffer!![outIndex++] =
                    (0xff shl 24) or ((r shr 10) shl 16) or ((g shr 10) shl 8) or (b shr 10)
            }
        }

        output.setPixels(outBuffer!!, 0, width, 0, 0, width, height)
    }
}
