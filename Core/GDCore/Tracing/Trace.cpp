#include "Trace.h"
#include <mutex>
#include <fstream>
#include <chrono>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <cstdlib>

namespace gd {

TraceLogger& TraceLogger::Instance() {
  static TraceLogger instance;
  return instance;
}

TraceLogger::TraceLogger() : m_initialized(false), m_fileHandle(nullptr) {}

TraceLogger::~TraceLogger() {
  // close file handle if needed
  if (m_fileHandle) {
    std::FILE* f = reinterpret_cast<std::FILE*>(m_fileHandle);
    std::fflush(f);
    std::fclose(f);
    m_fileHandle = nullptr;
  }
}

void TraceLogger::Initialize(const std::string& path) {
  if (m_initialized) return;
  m_path = path;

  // Allow override via env var
  const char* envPath = std::getenv("GD_TRACE_FILE");
  std::string finalPath = envPath ? std::string(envPath) : path;

  // open file in append mode
  std::FILE* f = std::fopen(finalPath.c_str(), "a+");
  if (!f) return;
  m_fileHandle = reinterpret_cast<void*>(f);
  m_initialized = true;
}

static std::mutex s_traceMutex;

static std::string isoNow() {
  using namespace std::chrono;
  auto now = system_clock::now();
  auto itt = system_clock::to_time_t(now);
  std::tm bt{};
#if defined(_MSC_VER)
  gmtime_s(&bt, &itt);
#else
  gmtime_r(&itt, &bt);
#endif
  auto ms = duration_cast<milliseconds>(now.time_since_epoch()) % 1000;
  std::ostringstream ss;
  ss << std::put_time(&bt, "%Y-%m-%dT%H:%M:%S") << "." << std::setfill('0') << std::setw(3) << ms.count() << "Z";
  return ss.str();
}

void TraceLogger::TraceEvent(const std::string& name, const std::string& jsonData) {
  std::lock_guard<std::mutex> lock(s_traceMutex);
  if (!m_initialized) {
    // initialize with default path in current working dir
    Initialize("gdevelop-trace.jsonl");
    if (!m_initialized) return;
  }

  std::FILE* f = reinterpret_cast<std::FILE*>(m_fileHandle);
  if (!f) return;

  std::string timestamp = isoNow();

  // Build a compact JSON object line
  std::string sanitized = jsonData;
  // If jsonData is empty, just emit basic event
  if (sanitized.empty()) {
    std::fprintf(f, "{\"ts\":\"%s\",\"name\":\"%s\"}\n", timestamp.c_str(), name.c_str());
  } else {
    std::fprintf(f, "{\"ts\":\"%s\",\"name\":\"%s\",\"data\":%s}\n", timestamp.c_str(), name.c_str(), sanitized.c_str());
  }
  std::fflush(f);
}

TraceLogger::Scope::Scope(const std::string& name) : m_name(name) {
  TraceLogger::Instance().TraceEvent((m_name + "_start"), "");
}

TraceLogger::Scope::~Scope() {
  TraceLogger::Instance().TraceEvent((m_name + "_end"), "");
}

}  // namespace gd
