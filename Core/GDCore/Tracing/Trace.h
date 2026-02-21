/* Lightweight tracing utility for GDevelop
 * Writes newline-delimited JSON events to a trace file when enabled.
 * Not a full OpenTelemetry implementation. Useful for local tracing and lightweight diagnostics.
 */

#pragma once

#include <string>
#include "GDCore/String.h"

namespace gd {

class TraceLogger {
 public:
  static TraceLogger& Instance();

  // Initialize the logger with a file path. If not called, a default path is used.
  void Initialize(const std::string& path = "gdevelop-trace.jsonl");

  // Emit a single event (JSON string). Thread-safe.
  void TraceEvent(const std::string& name, const std::string& jsonData = "");

  // RAII scope tracing: emits begin and end events.
  class Scope {
   public:
    Scope(const std::string& name);
    ~Scope();
   private:
    std::string m_name;
  };

 private:
  TraceLogger();
  ~TraceLogger();

  bool m_initialized;
  std::string m_path;
  void* m_fileHandle; // opaque to avoid <fstream> in header
};

// Convenience macros
#define TRACE_EVENT(name, json) gd::TraceLogger::Instance().TraceEvent((name), (json))
#define TRACE_EVENT_SIMPLE(name) gd::TraceLogger::Instance().TraceEvent((name), "")
#define TRACE_SCOPE(name) gd::TraceLogger::Instance().Scope TRACE_SCOPE_RAII__(name)

}  // namespace gd
