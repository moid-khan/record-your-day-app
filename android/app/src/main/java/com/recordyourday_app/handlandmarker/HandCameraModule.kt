package com.recordyourday_app.handlandmarker

import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import java.util.Locale

class HandCameraModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var textToSpeech: TextToSpeech? = null
    private var ttsInitialized = false

    init {
        // Initialize TTS
        textToSpeech = TextToSpeech(reactContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                textToSpeech?.language = Locale.US
                ttsInitialized = true
                android.util.Log.i(NAME, "TTS initialized successfully")
            } else {
                android.util.Log.e(NAME, "TTS initialization failed")
            }
        }
    }

    override fun getName(): String = NAME

    companion object {
        const val NAME = "HandCameraViewManager"
    }

    private fun getView(viewTag: Int): HandCameraViewNative? {
        return try {
            val uiManager = UIManagerHelper.getUIManager(reactApplicationContext, UIManagerType.DEFAULT)
            uiManager?.resolveView(viewTag) as? HandCameraViewNative
        } catch (e: Exception) {
            android.util.Log.e(NAME, "Error resolving view", e)
            null
        }
    }

    @ReactMethod
    fun start(viewTag: Int) {
        android.util.Log.d(NAME, "start() called for viewTag: $viewTag")
        mainHandler.post {
            val view = getView(viewTag)
            android.util.Log.d(NAME, "Resolved view: $view")
            view?.setActive(true)
        }
    }

    @ReactMethod
    fun stop(viewTag: Int) {
        android.util.Log.d(NAME, "stop() called for viewTag: $viewTag")
        mainHandler.post {
            val view = getView(viewTag)
            view?.setActive(false)
        }
    }

    @ReactMethod
    fun startRecording(viewTag: Int) {
        android.util.Log.i(NAME, "startRecording() called for viewTag: $viewTag")
        mainHandler.post {
            val view = getView(viewTag)
            view?.startRecording()
        }
    }

    @ReactMethod
    fun pauseRecording(viewTag: Int) {
        android.util.Log.i(NAME, "pauseRecording() called for viewTag: $viewTag")
        mainHandler.post {
            val view = getView(viewTag)
            view?.pauseRecording()
        }
    }

    @ReactMethod
    fun resumeRecording(viewTag: Int) {
        android.util.Log.i(NAME, "resumeRecording() called for viewTag: $viewTag")
        mainHandler.post {
            val view = getView(viewTag)
            view?.resumeRecording()
        }
    }

    @ReactMethod
    fun stopRecording(viewTag: Int) {
        android.util.Log.i(NAME, "stopRecording() called for viewTag: $viewTag")
        mainHandler.post {
            val view = getView(viewTag)
            view?.stopRecording()
        }
    }

    @ReactMethod
    fun speakCue(viewTag: Int, text: String) {
        android.util.Log.i(NAME, "speakCue() called: $text")
        if (ttsInitialized && textToSpeech != null) {
            textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "speakCue")
        } else {
            android.util.Log.w(NAME, "TTS not initialized, cannot speak: $text")
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
    }
}
