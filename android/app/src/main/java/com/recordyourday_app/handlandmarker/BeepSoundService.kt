package com.recordyourday_app.handlandmarker

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.os.Build
import android.util.Log

class BeepSoundService private constructor(private val context: Context) {

    private var soundPool: SoundPool? = null
    private var beepSoundId: Int = 0
    private var isLoaded = false
    private var isBeeping = false
    private var beepRunnable: Runnable? = null
    private val beepHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val beepIntervalMs: Long = 400 // Beep every 400ms for continuous sound

    init {
        initializeSoundPool()
    }

    private fun initializeSoundPool() {
        Log.d(TAG, "Initializing SoundPool...")
        try {
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            soundPool = SoundPool.Builder()
                .setMaxStreams(2)
                .setAudioAttributes(audioAttributes)
                .build()

            soundPool?.setOnLoadCompleteListener { _, sampleId, status ->
                if (status == 0) {
                    isLoaded = true
                    Log.i(TAG, "✅ Beep sound loaded successfully (sampleId=$sampleId)")
                } else {
                    Log.e(TAG, "❌ Failed to load beep sound (status=$status)")
                }
            }

            // Load the beep sound from raw resources
            // We'll create a simple beep using raw resource
            val resId = context.resources.getIdentifier("beep", "raw", context.packageName)
            if (resId != 0) {
                beepSoundId = soundPool?.load(context, resId, 1) ?: 0
                Log.d(TAG, "Loading beep from raw resource (id=$resId)")
            } else {
                // Fallback: generate a beep programmatically
                Log.w(TAG, "No beep.wav found in raw resources, using generated tone")
                generateAndLoadBeepSound()
            }

            Log.d(TAG, "✅ SoundPool initialized")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to initialize SoundPool", e)
        }
    }

    private fun generateAndLoadBeepSound() {
        // Create a simple beep WAV file programmatically
        try {
            val sampleRate = 44100
            val durationMs = 200
            val frequency = 1000.0 // 1kHz beep
            val numSamples = (sampleRate * durationMs / 1000)

            // Generate sine wave samples
            val samples = ShortArray(numSamples)
            for (i in 0 until numSamples) {
                val angle = 2.0 * Math.PI * i / (sampleRate / frequency)
                samples[i] = (Math.sin(angle) * 32767 * 0.8).toInt().toShort()
            }

            // Create WAV file in cache
            val wavFile = java.io.File(context.cacheDir, "beep_generated.wav")
            writeWavFile(wavFile, samples, sampleRate)

            beepSoundId = soundPool?.load(wavFile.absolutePath, 1) ?: 0
            Log.d(TAG, "Generated beep sound loaded (id=$beepSoundId)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to generate beep sound", e)
        }
    }

    private fun writeWavFile(file: java.io.File, samples: ShortArray, sampleRate: Int) {
        val byteRate = sampleRate * 2 // 16-bit mono
        val dataSize = samples.size * 2
        val totalSize = 36 + dataSize

        java.io.FileOutputStream(file).use { fos ->
            java.io.DataOutputStream(fos).use { dos ->
                // RIFF header
                dos.writeBytes("RIFF")
                dos.write(intToBytes(totalSize), 0, 4)
                dos.writeBytes("WAVE")

                // fmt chunk
                dos.writeBytes("fmt ")
                dos.write(intToBytes(16), 0, 4) // chunk size
                dos.write(shortToBytes(1), 0, 2) // audio format (PCM)
                dos.write(shortToBytes(1), 0, 2) // num channels
                dos.write(intToBytes(sampleRate), 0, 4)
                dos.write(intToBytes(byteRate), 0, 4)
                dos.write(shortToBytes(2), 0, 2) // block align
                dos.write(shortToBytes(16), 0, 2) // bits per sample

                // data chunk
                dos.writeBytes("data")
                dos.write(intToBytes(dataSize), 0, 4)

                // Write samples
                for (sample in samples) {
                    dos.write(shortToBytes(sample.toInt()), 0, 2)
                }
            }
        }
    }

    private fun intToBytes(value: Int): ByteArray {
        return byteArrayOf(
            (value and 0xff).toByte(),
            ((value shr 8) and 0xff).toByte(),
            ((value shr 16) and 0xff).toByte(),
            ((value shr 24) and 0xff).toByte()
        )
    }

    private fun shortToBytes(value: Int): ByteArray {
        return byteArrayOf(
            (value and 0xff).toByte(),
            ((value shr 8) and 0xff).toByte()
        )
    }

    fun startContinuousBeep() {
        if (isBeeping) {
            Log.d(TAG, "Already beeping, skipping")
            return
        }

        if (soundPool == null) {
            Log.e(TAG, "❌ Cannot start beep: SoundPool is NULL! Reinitializing...")
            initializeSoundPool()
        }

        isBeeping = true
        Log.i(TAG, "🔔 Starting continuous beep (SoundPool=${soundPool != null}, loaded=$isLoaded)")

        beepRunnable = object : Runnable {
            override fun run() {
                if (isBeeping) {
                    try {
                        val pool = soundPool
                        if (pool != null && beepSoundId != 0) {
                            // Play at full volume on both channels
                            val streamId = pool.play(beepSoundId, 1.0f, 1.0f, 1, 0, 1.0f)
                            if (streamId != 0) {
                                Log.d(TAG, "🎵 Beep played (streamId=$streamId)")
                            } else {
                                Log.w(TAG, "⚠️ SoundPool.play returned 0 - sound not loaded yet or error")
                            }
                            beepHandler.postDelayed(this, beepIntervalMs)
                        } else {
                            Log.e(TAG, "❌ SoundPool or beepSoundId invalid")
                            // Try to reinitialize
                            if (!isLoaded) {
                                generateAndLoadBeepSound()
                            }
                            beepHandler.postDelayed(this, beepIntervalMs)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "❌ Error playing beep", e)
                        beepHandler.postDelayed(this, beepIntervalMs)
                    }
                }
            }
        }

        beepRunnable?.let {
            Log.d(TAG, "Posting beep runnable to handler")
            beepHandler.post(it)
        }
    }

    fun stopContinuousBeep() {
        if (!isBeeping) {
            return
        }

        isBeeping = false
        beepRunnable?.let { beepHandler.removeCallbacks(it) }
        beepRunnable = null
        soundPool?.autoPause() // Stop any playing sounds
        Log.d(TAG, "Stopped continuous beep")
    }

    fun isBeeping(): Boolean {
        return isBeeping
    }

    fun release() {
        stopContinuousBeep()
        soundPool?.release()
        soundPool = null
        isLoaded = false
    }

    companion object {
        private const val TAG = "BeepSoundService"

        @Volatile
        private var INSTANCE: BeepSoundService? = null

        fun getInstance(context: Context): BeepSoundService {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: BeepSoundService(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
}
