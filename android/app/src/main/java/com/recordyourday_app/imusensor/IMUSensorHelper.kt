package com.recordyourday_app.imusensor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Data class representing a single IMU reading
 */
data class IMUReading(
    val timestamp: Double,  // Relative time from recording start (seconds)
    val ax: Double,         // Accelerometer X (m/s²)
    val ay: Double,         // Accelerometer Y (m/s²)
    val az: Double,         // Accelerometer Z (m/s²)
    val gx: Double,         // Gyroscope X (rad/s)
    val gy: Double,         // Gyroscope Y (rad/s)
    val gz: Double          // Gyroscope Z (rad/s)
) {
    fun toJSONObject(): JSONObject {
        return JSONObject().apply {
            put("t", timestamp)
            put("ax", ax)
            put("ay", ay)
            put("az", az)
            put("gx", gx)
            put("gy", gy)
            put("gz", gz)
        }
    }
}

/**
 * Helper class for collecting IMU (Inertial Measurement Unit) sensor data
 * synchronized with video recording.
 */
class IMUSensorHelper(private val context: Context) : SensorEventListener {

    companion object {
        private const val TAG = "IMUSensorHelper"
        private const val SAMPLING_RATE_HZ = 100.0
        private const val SAMPLING_PERIOD_US = (1_000_000 / SAMPLING_RATE_HZ).toInt() // 10000μs = 100Hz
    }

    private val sensorManager: SensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

    private val imuReadings = mutableListOf<IMUReading>()
    private var startTimeNanos: Long = 0
    private var absoluteStartTimestamp: Long = 0
    private var isCollecting = false

    // Temporary storage for latest sensor values
    private var lastAccelValues: FloatArray? = null
    private var lastGyroValues: FloatArray? = null
    private var lastAccelTimestamp: Long = 0
    private var lastGyroTimestamp: Long = 0

    private val dataLock = Any()

    /**
     * Check if accelerometer and gyroscope are available
     */
    val isSensorAvailable: Boolean
        get() = accelerometer != null && gyroscope != null

    /**
     * Start collecting IMU data
     * @param referenceTimeNanos Optional reference time in nanoseconds for synchronization
     * @return true if collection started successfully
     */
    fun startCollection(referenceTimeNanos: Long? = null): Boolean {
        if (isCollecting) {
            Log.w(TAG, "Already collecting")
            return false
        }

        if (!isSensorAvailable) {
            Log.e(TAG, "IMU sensors not available")
            return false
        }

        synchronized(dataLock) {
            imuReadings.clear()
            lastAccelValues = null
            lastGyroValues = null
        }

        // Set reference time
        startTimeNanos = referenceTimeNanos ?: SystemClock.elapsedRealtimeNanos()
        absoluteStartTimestamp = System.currentTimeMillis()

        // Register sensor listeners with fastest sampling rate
        val success = sensorManager.registerListener(
            this,
            accelerometer,
            SAMPLING_PERIOD_US
        ) && sensorManager.registerListener(
            this,
            gyroscope,
            SAMPLING_PERIOD_US
        )

        if (success) {
            isCollecting = true
            Log.i(TAG, "Started collecting at ${SAMPLING_RATE_HZ}Hz, reference time: $startTimeNanos")
        } else {
            Log.e(TAG, "Failed to register sensor listeners")
            sensorManager.unregisterListener(this)
        }

        return success
    }

    /**
     * Stop collecting IMU data
     * @return List of collected IMU readings
     */
    fun stopCollection(): List<IMUReading> {
        if (!isCollecting) {
            Log.w(TAG, "Not collecting")
            return emptyList()
        }

        sensorManager.unregisterListener(this)
        isCollecting = false

        val readings: List<IMUReading>
        synchronized(dataLock) {
            readings = imuReadings.toList()
        }

        Log.i(TAG, "Stopped collecting. Total samples: ${readings.size}")
        return readings
    }

    /**
     * Get the current relative timestamp from recording start in seconds
     */
    fun getRelativeTimestamp(): Double {
        if (!isCollecting) return 0.0
        return (SystemClock.elapsedRealtimeNanos() - startTimeNanos) / 1_000_000_000.0
    }

    /**
     * Save IMU data to JSON file
     * @param readings List of IMU readings to save
     * @param videoPath Path to the corresponding video file (used to generate IMU file path)
     * @return Path to the saved IMU JSON file, or null if save failed
     */
    fun saveToJSON(readings: List<IMUReading>, videoPath: String): String? {
        // Generate IMU file path based on video path
        val imuPath = videoPath.replace(".mp4", "_imu.json")

        val videoFileName = File(videoPath).name

        // Build JSON structure
        val jsonObject = JSONObject().apply {
            put("videoFile", videoFileName)
            put("startTimestamp", absoluteStartTimestamp / 1000.0) // Convert to seconds
            put("samplingRateHz", SAMPLING_RATE_HZ)
            put("sampleCount", readings.size)
            put("durationSeconds", readings.lastOrNull()?.timestamp ?: 0.0)

            val dataArray = JSONArray()
            readings.forEach { reading ->
                dataArray.put(reading.toJSONObject())
            }
            put("data", dataArray)
        }

        return try {
            val file = File(imuPath)
            file.writeText(jsonObject.toString(2)) // Pretty print with 2-space indent
            Log.i(TAG, "Saved IMU data to: $imuPath")
            Log.i(TAG, "File size: ${file.length()} bytes, samples: ${readings.size}")
            imuPath
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save IMU data: ${e.message}")
            null
        }
    }

    /**
     * Convenience method to stop collection and save to JSON
     * @param videoPath Path to the corresponding video file
     * @return Path to the saved IMU JSON file, or null if save failed
     */
    fun stopAndSave(videoPath: String): String? {
        val readings = stopCollection()
        if (readings.isEmpty()) {
            Log.w(TAG, "No IMU data to save")
            return null
        }
        return saveToJSON(readings, videoPath)
    }

    // SensorEventListener implementation
    override fun onSensorChanged(event: SensorEvent) {
        if (!isCollecting) return

        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                lastAccelValues = event.values.clone()
                lastAccelTimestamp = event.timestamp
            }
            Sensor.TYPE_GYROSCOPE -> {
                lastGyroValues = event.values.clone()
                lastGyroTimestamp = event.timestamp
            }
        }

        // Create a reading when we have both sensor values
        val accel = lastAccelValues
        val gyro = lastGyroValues

        if (accel != null && gyro != null) {
            // Use the most recent timestamp for relative time calculation
            val sensorTimestamp = maxOf(lastAccelTimestamp, lastGyroTimestamp)
            val relativeTimestamp = (sensorTimestamp - startTimeNanos) / 1_000_000_000.0

            // Only add if timestamp is positive (after recording started)
            if (relativeTimestamp >= 0) {
                val reading = IMUReading(
                    timestamp = relativeTimestamp,
                    ax = accel[0].toDouble(),
                    ay = accel[1].toDouble(),
                    az = accel[2].toDouble(),
                    gx = gyro[0].toDouble(),
                    gy = gyro[1].toDouble(),
                    gz = gyro[2].toDouble()
                )

                synchronized(dataLock) {
                    // Avoid duplicate readings at same timestamp
                    if (imuReadings.isEmpty() || imuReadings.last().timestamp < relativeTimestamp) {
                        imuReadings.add(reading)
                    }
                }
            }

            // Clear after combining to wait for fresh pair
            lastAccelValues = null
            lastGyroValues = null
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }

    /**
     * Clean up resources
     */
    fun cleanup() {
        if (isCollecting) {
            sensorManager.unregisterListener(this)
            isCollecting = false
        }
        synchronized(dataLock) {
            imuReadings.clear()
        }
    }
}
