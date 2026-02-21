/*
 * GDevelop Core
 * Copyright 2008-2026 Florian Rival (Florian.Rival@gmail.com). All rights
 * reserved. This project is released under the MIT License.
 */

#include "CinematicSequence.h"
#include "GDCore/Serialization/SerializerElement.h"
#include <string>
#include <algorithm>

using std::string;

namespace gd {

void CinematicSequence::SerializeTo(SerializerElement& element) const {
  element.SetAttribute("name", name);
  element.SetAttribute("sequenceData", sequenceData);
  element.SetAttribute("associatedLayout", associatedLayout);
  element.SetAttribute("sequenceVersion", sequenceVersion);
}

void CinematicSequence::UnserializeFrom(gd::Project& project,
                                        const SerializerElement& element) {
  name = element.GetStringAttribute("name", "", "Name");
  sequenceData = element.GetStringAttribute("sequenceData", "");
  associatedLayout = element.GetStringAttribute("associatedLayout", "", "AssociatedLayout");
  // Read schema/version if present. Default to 1.
  sequenceVersion = element.GetIntAttribute("sequenceVersion", 1);
}

bool CinematicSequence::ValidateSequence(gd::String &errorOut) const {
  // Lightweight validation: ensure sequenceData contains "tracks" and is not empty.
  if (sequenceData.empty()) {
    errorOut = "Sequence data is empty.";
    return false;
  }

  const string raw = sequenceData.Raw();
  // Look for "tracks" token in the JSON string. This is a simple heuristic
  // to detect obviously invalid sequences. Full validation must be done by
  // IDE-side JSON schema validator.
  if (raw.find("\"tracks\"") == string::npos) {
    errorOut = "Missing 'tracks' property in sequence data.";
    return false;
  }

  // Optional: check duration field exists
  if (raw.find("\"duration\"") == string::npos) {
    // Not fatal: sequences may omit duration; return true but set a warning.
    errorOut = "Warning: 'duration' property not found; duration will be approximated.";
    return true;
  }

  // Basic success
  errorOut = "";
  return true;
}

double CinematicSequence::GetApproxDuration() const {
  const string raw = sequenceData.Raw();
  const string key = "\"duration\"";
  size_t pos = raw.find(key);
  if (pos == string::npos) return 0.0;

  // Find the colon after the key
  pos = raw.find(':', pos + key.length());
  if (pos == string::npos) return 0.0;

  // Extract substring after colon
  size_t start = pos + 1;
  // skip spaces
  while (start < raw.size() && isspace(static_cast<unsigned char>(raw[start]))) ++start;

  // read until non-number char (allow digits, dot, minus, exponent)
  size_t end = start;
  while (end < raw.size()) {
    char c = raw[end];
    if ((c >= '0' && c <= '9') || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E') {
      ++end;
    } else break;
  }

  if (end == start) return 0.0;

  try {
    const string numStr = raw.substr(start, end - start);
    return std::stod(numStr);
  } catch (...) {
    return 0.0;
  }
}

}  // namespace gd
