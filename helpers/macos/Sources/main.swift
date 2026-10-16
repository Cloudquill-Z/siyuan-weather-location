import CoreLocation
import Foundation
import Network

let defaultTimeoutSeconds: Double = 18
let defaultPort: UInt16 = 47821

func argumentValue(after flag: String) -> String? {
    CommandLine.arguments.enumerated().compactMap { index, value -> String? in
        guard value == flag, CommandLine.arguments.indices.contains(index + 1) else {
            return nil
        }
        return CommandLine.arguments[index + 1]
    }.first
}

let timeoutSeconds = Double(argumentValue(after: "--timeout") ?? "") ?? defaultTimeoutSeconds
let outputPath = argumentValue(after: "--output")
let serverPort = UInt16(argumentValue(after: "--port") ?? "") ?? defaultPort
let shouldRunServer = CommandLine.arguments.contains("--server") || (
    outputPath == nil &&
    !CommandLine.arguments.contains("--timeout")
)

func jsonData(_ payload: [String: Any]) -> Data {
    (try? JSONSerialization.data(withJSONObject: payload, options: [])) ?? Data("{}".utf8)
}

func writeJSONAndExit(_ payload: [String: Any], exitCode: Int32) -> Never {
    let data = jsonData(payload)
    if let outputPath {
        try? data.write(to: URL(fileURLWithPath: outputPath))
    } else {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    }
    exit(exitCode)
}

func logHelper(_ message: String) {
    let line = "[helper \(Date())] \(message)\n"
    if let data = line.data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

var activeRequests: [UUID: LocationRequest] = [:]

final class LocationRequest: NSObject, CLLocationManagerDelegate {
    private let id: UUID
    private let manager = CLLocationManager()
    private let timeoutSeconds: Double
    private let completion: ([String: Any], Int32) -> Void
    private var didFinish = false

    init(id: UUID, timeoutSeconds: Double, completion: @escaping ([String: Any], Int32) -> Void) {
        self.id = id
        self.timeoutSeconds = timeoutSeconds
        self.completion = completion
        super.init()
    }

    func start() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest

        DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds) { [weak self] in
            self?.timeout()
        }

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finishError("permission-denied", "Location permission is denied or restricted")
        @unknown default:
            finishError("unknown-authorization", "Unknown location authorization status")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !didFinish else {
            return
        }

        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.requestLocation()
        case .denied, .restricted:
            finishError("permission-denied", "Location permission is denied or restricted")
        case .notDetermined:
            break
        @unknown default:
            finishError("unknown-authorization", "Unknown location authorization status")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finishError("no-location", "No location was returned")
            return
        }

        finish([
            "ok": true,
            "lat": location.coordinate.latitude,
            "lon": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": Int(location.timestamp.timeIntervalSince1970 * 1000),
            "source": "macos-corelocation"
        ], exitCode: 0)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finishError("location-error", error.localizedDescription)
    }

    private func timeout() {
        finishError("timeout", "Location request timed out")
    }

    private func finishError(_ code: String, _ message: String) {
        finish([
            "ok": false,
            "error": code,
            "message": message
        ], exitCode: 1)
    }

    private func finish(_ payload: [String: Any], exitCode: Int32) {
        guard !didFinish else {
            return
        }
        didFinish = true
        activeRequests.removeValue(forKey: id)
        completion(payload, exitCode)
    }
}

func requestLocation(timeoutSeconds: Double, completion: @escaping ([String: Any], Int32) -> Void) {
    let id = UUID()
    let request = LocationRequest(id: id, timeoutSeconds: timeoutSeconds, completion: completion)
    activeRequests[id] = request
    request.start()
}

func statusText(for exitCode: Int32) -> String {
    exitCode == 0 ? "200 OK" : "500 Internal Server Error"
}

func sendHTTPResponse(_ connection: NWConnection, payload: [String: Any], status: String = "200 OK") {
    let body = jsonData(payload)
    let headers = [
        "HTTP/1.1 \(status)",
        "Content-Type: application/json; charset=utf-8",
        "Access-Control-Allow-Origin: *",
        "Access-Control-Allow-Methods: GET, OPTIONS",
        "Access-Control-Allow-Headers: Content-Type",
        "Content-Length: \(body.count)",
        "Connection: close",
        "",
        ""
    ].joined(separator: "\r\n")

    var response = Data(headers.utf8)
    response.append(body)
    connection.send(content: response, completion: .contentProcessed { _ in
        connection.cancel()
    })
}

func queryTimeout(from path: String) -> Double {
    guard let components = URLComponents(string: "http://127.0.0.1\(path)"),
          let rawValue = components.queryItems?.first(where: { $0.name == "timeout" })?.value,
          let value = Double(rawValue) else {
        return defaultTimeoutSeconds
    }
    return min(max(value, 3), 60)
}

func handleRequest(_ request: String, connection: NWConnection) {
    let firstLine = request.components(separatedBy: "\r\n").first ?? ""
    let parts = firstLine.split(separator: " ")

    guard parts.count >= 2 else {
        sendHTTPResponse(connection, payload: [
            "ok": false,
            "error": "bad-request",
            "message": "Bad request"
        ], status: "400 Bad Request")
        return
    }

    let method = String(parts[0])
    let path = String(parts[1])

    if method == "OPTIONS" {
        sendHTTPResponse(connection, payload: ["ok": true])
        return
    }

    if method != "GET" {
        sendHTTPResponse(connection, payload: [
            "ok": false,
            "error": "method-not-allowed",
            "message": "Only GET is supported"
        ], status: "405 Method Not Allowed")
        return
    }

    if path.hasPrefix("/health") {
        sendHTTPResponse(connection, payload: [
            "ok": true,
            "source": "macos-corelocation-helper"
        ])
        return
    }

    if path.hasPrefix("/location") {
        requestLocation(timeoutSeconds: queryTimeout(from: path)) { payload, exitCode in
            sendHTTPResponse(connection, payload: payload, status: statusText(for: exitCode))
        }
        return
    }

    if path.hasPrefix("/shutdown") {
        sendHTTPResponse(connection, payload: [
            "ok": true,
            "message": "Location helper is shutting down"
        ])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            exit(0)
        }
        return
    }

    sendHTTPResponse(connection, payload: [
        "ok": false,
        "error": "not-found",
        "message": "Not found"
    ], status: "404 Not Found")
}

func runServer(port: UInt16) throws {
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(IPv4Address("127.0.0.1")!), port: NWEndpoint.Port(rawValue: port)!)
    let listener = try NWListener(using: parameters)

    listener.stateUpdateHandler = { state in
        switch state {
        case .ready:
            logHelper("listener ready on 127.0.0.1:\(port)")
        case .failed(let error):
            logHelper("listener failed: \(error)")
            exit(1)
        case .waiting(let error):
            logHelper("listener waiting: \(error)")
        case .cancelled:
            logHelper("listener cancelled")
        default:
            logHelper("listener state: \(state)")
        }
    }

    listener.newConnectionHandler = { connection in
        connection.start(queue: .main)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
            let request = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            handleRequest(request, connection: connection)
        }
    }

    listener.start(queue: .main)
    RunLoop.main.run()
}

if shouldRunServer {
    do {
        try runServer(port: serverPort)
    } catch {
        writeJSONAndExit([
            "ok": false,
            "error": "server-error",
            "message": error.localizedDescription
        ], exitCode: 1)
    }
} else {
    requestLocation(timeoutSeconds: timeoutSeconds) { payload, exitCode in
        writeJSONAndExit(payload, exitCode: exitCode)
    }
    RunLoop.main.run()
}
