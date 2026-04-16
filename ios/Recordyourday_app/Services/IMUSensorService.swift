import Foundation
import CoreMotion
import QuartzCore

/// Data structure representing a single IMU reading
struct IMUReading {
    let timestamp: TimeInterval  // Relative time from recording start (seconds)
    let ax: Double  // Accelerometer X (m/s²)
    let ay: Double  // Accelerometer Y (m/s²)
    let az: Double  // Accelerometer Z (m/s²)
    let gx: Double  // Gyroscope X (rad/s)
    let gy: Double  // Gyroscope Y (rad/s)
    let gz: Double  // Gyroscope Z (rad/s)

    func toDictionary() -> [String: Any] {
        return [
            "t": timestamp,
            "ax": ax,
            "ay": ay,
            "az": az,
            "gx": gx,
            "gy": gy,
            "gz": gz
        ]
    }
}

/// Service for collecting IMU (Inertial Measurement Unit) sensor data
/// synchronized with video recording
class IMUSensorService {

    // MARK: - Properties

    private let motionManager = CMMotionManager()
    private var imuReadings: [IMUReading] = []
    private var startTime: TimeInterval = 0
    private var isCollecting = false
    private let samplingRateHz: Double = 100.0
    private var absoluteStartTimestamp: TimeInterval = 0

    private let dataQueue = DispatchQueue(label: "com.recordyourday.IMUSensorService.dataQueue", qos: .userInteractive)
    private let operationQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "com.recordyourday.IMUSensorService.operationQueue"
        queue.maxConcurrentOperationCount = 1
        queue.qualityOfService = .userInteractive
        return queue
    }()

    // MARK: - Public Methods

    /// Check if device motion (combined accelerometer + gyroscope) is available
    var isDeviceMotionAvailable: Bool {
        return motionManager.isDeviceMotionAvailable
    }

    /// Start collecting IMU data
    /// - Parameter referenceTime: The reference timestamp (CACurrentMediaTime) for synchronization with video
    /// - Returns: true if collection started successfully
    @discardableResult
    func startCollection(referenceTime: TimeInterval? = nil) -> Bool {
        guard !isCollecting else {
            print("[IMUSensorService] Already collecting")
            return false
        }

        guard motionManager.isDeviceMotionAvailable else {
            print("[IMUSensorService] Device motion not available")
            return false
        }

        // Clear previous data
        dataQueue.sync {
            imuReadings.removeAll()
        }

        // Set the reference time - use provided time or current time
        startTime = referenceTime ?? CACurrentMediaTime()
        absoluteStartTimestamp = Date().timeIntervalSince1970

        // Configure sampling interval (100Hz = 0.01 seconds)
        motionManager.deviceMotionUpdateInterval = 1.0 / samplingRateHz

        // Start device motion updates (provides synchronized accelerometer + gyroscope)
        motionManager.startDeviceMotionUpdates(to: operationQueue) { [weak self] motion, error in
            guard let self = self, let motion = motion else {
                if let error = error {
                    print("[IMUSensorService] Error: \(error.localizedDescription)")
                }
                return
            }

            self.processMotionData(motion)
        }

        isCollecting = true
        print("[IMUSensorService] Started collecting at \(samplingRateHz)Hz, reference time: \(startTime)")
        return true
    }

    /// Stop collecting IMU data
    /// - Returns: Array of collected IMU readings
    func stopCollection() -> [IMUReading] {
        guard isCollecting else {
            print("[IMUSensorService] Not collecting")
            return []
        }

        motionManager.stopDeviceMotionUpdates()
        isCollecting = false

        var readings: [IMUReading] = []
        dataQueue.sync {
            readings = imuReadings
        }

        print("[IMUSensorService] Stopped collecting. Total samples: \(readings.count)")
        return readings
    }

    /// Get the current relative timestamp from recording start
    func getRelativeTimestamp() -> TimeInterval {
        guard isCollecting else { return 0 }
        return CACurrentMediaTime() - startTime
    }

    /// Save IMU data to JSON file
    /// - Parameters:
    ///   - readings: Array of IMU readings to save
    ///   - videoPath: Path to the corresponding video file (used to generate IMU file path)
    /// - Returns: Path to the saved IMU JSON file, or nil if save failed
    func saveToJSON(readings: [IMUReading], videoPath: String) -> String? {
        // Generate IMU file path based on video path
        let imuPath = videoPath.replacingOccurrences(of: ".mp4", with: "_imu.json")

        // Build JSON structure
        let videoFileName = (videoPath as NSString).lastPathComponent
        let jsonData: [String: Any] = [
            "videoFile": videoFileName,
            "startTimestamp": absoluteStartTimestamp,
            "samplingRateHz": samplingRateHz,
            "sampleCount": readings.count,
            "durationSeconds": readings.last?.timestamp ?? 0,
            "data": readings.map { $0.toDictionary() }
        ]

        do {
            let data = try JSONSerialization.data(withJSONObject: jsonData, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: URL(fileURLWithPath: imuPath))
            print("[IMUSensorService] Saved IMU data to: \(imuPath)")
            print("[IMUSensorService] File size: \(data.count) bytes, samples: \(readings.count)")
            return imuPath
        } catch {
            print("[IMUSensorService] Failed to save IMU data: \(error.localizedDescription)")
            return nil
        }
    }

    /// Convenience method to stop collection and save to JSON
    /// - Parameter videoPath: Path to the corresponding video file
    /// - Returns: Path to the saved IMU JSON file, or nil if save failed
    func stopAndSave(videoPath: String) -> String? {
        let readings = stopCollection()
        guard !readings.isEmpty else {
            print("[IMUSensorService] No IMU data to save")
            return nil
        }
        return saveToJSON(readings: readings, videoPath: videoPath)
    }

    // MARK: - Private Methods

    private func processMotionData(_ motion: CMDeviceMotion) {
        // Calculate relative timestamp from recording start
        let currentTime = CACurrentMediaTime()
        let relativeTimestamp = currentTime - startTime

        // Get user acceleration (without gravity) in m/s²
        // Note: CMDeviceMotion.userAcceleration is in G's, convert to m/s²
        let gravity = 9.81
        let userAccel = motion.userAcceleration

        // Get rotation rate in rad/s
        let rotationRate = motion.rotationRate

        // Create IMU reading
        // We use gravity-included acceleration for full IMU data
        // motion.gravity gives the gravity vector, motion.userAcceleration gives acceleration without gravity
        // For full accelerometer data: userAcceleration + gravity
        let reading = IMUReading(
            timestamp: relativeTimestamp,
            ax: (userAccel.x + motion.gravity.x) * gravity,
            ay: (userAccel.y + motion.gravity.y) * gravity,
            az: (userAccel.z + motion.gravity.z) * gravity,
            gx: rotationRate.x,
            gy: rotationRate.y,
            gz: rotationRate.z
        )

        // Store reading thread-safely
        dataQueue.async {
            self.imuReadings.append(reading)
        }
    }
}
