#version 300 es
precision highp float;
precision highp usampler2D;

uniform usampler2D uTerrain;
uniform vec3 uOceanColor;
uniform vec3 uSandColor;
uniform vec3 uPlainsColor;
uniform vec3 uHighlandColor;
uniform vec3 uMountainColor;

in vec2 vUV;
out vec4 fragColor;

void main() {
  ivec2 size = textureSize(uTerrain, 0);
  ivec2 coord = clamp(ivec2(vUV * vec2(size)), ivec2(0), size - 1);
  uint terrain = texelFetch(uTerrain, coord, 0).r;
  bool isLand = (terrain & 0x80u) != 0u;
  bool isShoreline = (terrain & 0x40u) != 0u;
  float magnitude = float(terrain & 0x1fu);
  vec3 color;

  if (isLand && magnitude == 31.0) {
    color = vec3(60.0);
  } else if (isLand && isShoreline) {
    color = uSandColor;
  } else if (isLand && magnitude < 10.0) {
    color = uPlainsColor + vec3(0.0, -2.0 * magnitude, 0.0);
  } else if (isLand && magnitude < 20.0) {
    color = min(vec3(255.0), uHighlandColor + vec3(2.0 * (magnitude - 10.0)));
  } else if (isLand) {
    color = min(vec3(255.0), uMountainColor + vec3(floor(magnitude / 2.0)));
  } else if (isShoreline) {
    color = floor(0.7 * uOceanColor + vec3(76.5) + vec3(0.5));
  } else {
    color = max(vec3(0.0), uOceanColor - vec3(min(magnitude, 10.0)));
  }

  fragColor = vec4(color / 255.0, 1.0);
}
