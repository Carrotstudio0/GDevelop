#include "catch.hpp"
#include "GDCore/Project/CinematicSequence.h"

using namespace gd;

TEST_CASE("CinematicSequence - ValidateSequence and GetApproxDuration", "[CinematicSequence]") {
  CinematicSequence seq;

  // Empty data should fail validation
  seq.SetSequenceData("");
  gd::String error;
  REQUIRE(seq.ValidateSequence(error) == false);
  REQUIRE(error.find("empty") != gd::String::npos || !error.empty());

  // Minimal valid data with tracks
  const char *json = "{\"version\":1,\"duration\":5.0,\"tracks\":[{\"id\":\"t1\",\"name\":\"Player\",\"type\":\"object\",\"keyframes\":[] }]}";
  seq.SetSequenceData(json);

  REQUIRE(seq.ValidateSequence(error) == true);
  REQUIRE(error.empty());

  double dur = seq.GetApproxDuration();
  REQUIRE(dur == Approx(5.0));
}
