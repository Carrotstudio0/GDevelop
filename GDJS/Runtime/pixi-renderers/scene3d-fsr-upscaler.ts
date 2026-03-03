namespace gdjs {
  export interface Scene3DFSRUpscalerConfig {
    enabled: boolean;
    renderScale: number;
    sharpness: number;
  }

  const DEFAULT_RENDER_SCALE = 0.75;
  const DEFAULT_SHARPNESS = 0.8;

  export const clampScene3DFSRRenderScale = (renderScale: number): number =>
    Math.min(1, Math.max(0.5, renderScale || DEFAULT_RENDER_SCALE));

  export const clampScene3DFSRSharpness = (sharpness: number): number =>
    Math.min(2, Math.max(0, sharpness || 0));

  const fullScreenVertexShader = `
    #version 300 es
    precision highp float;

    in vec3 position;
    in vec2 uv;

    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    out vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const easuFragmentShader = `
    #version 300 es
    precision highp float;
    precision highp sampler2D;

    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D tInput;
    uniform vec2 inputResolution;
    uniform vec2 outputResolution;

    float saturate(float value) {
      return clamp(value, 0.0, 1.0);
    }

    float rcpSafe(float value) {
      return 1.0 / (abs(value) > 1e-6 ? value : (value >= 0.0 ? 1e-6 : -1e-6));
    }

    float min3(float a, float b, float c) {
      return min(a, min(b, c));
    }

    float max3(float a, float b, float c) {
      return max(a, max(b, c));
    }

    vec4 min3(vec4 a, vec4 b, vec4 c) {
      return min(a, min(b, c));
    }

    vec4 max3(vec4 a, vec4 b, vec4 c) {
      return max(a, max(b, c));
    }

    ivec2 clampInputCoord(ivec2 pixelCoord) {
      return clamp(pixelCoord, ivec2(0), ivec2(inputResolution) - ivec2(1));
    }

    vec4 sampleInput(ivec2 pixelCoord) {
      return texelFetch(tInput, clampInputCoord(pixelCoord), 0);
    }

    float luma2(vec3 color) {
      return color.b * 0.5 + (color.r * 0.5 + color.g);
    }

    void fsrEasuTap(
      inout vec4 accumulatedColor,
      inout float accumulatedWeight,
      vec2 offset,
      vec2 direction,
      vec2 anisotropicLength,
      float negativeLobeStrength,
      float clippingPoint,
      vec4 tapColor
    ) {
      vec2 rotatedOffset;
      rotatedOffset.x = offset.x * direction.x + offset.y * direction.y;
      rotatedOffset.y = offset.x * -direction.y + offset.y * direction.x;
      rotatedOffset *= anisotropicLength;

      float distanceSquared = min(dot(rotatedOffset, rotatedOffset), clippingPoint);
      float base = 2.0 / 5.0 * distanceSquared - 1.0;
      float window = negativeLobeStrength * distanceSquared - 1.0;
      base *= base;
      window *= window;
      base = 25.0 / 16.0 * base - (25.0 / 16.0 - 1.0);

      float weight = base * window;
      accumulatedColor += tapColor * weight;
      accumulatedWeight += weight;
    }

    void fsrEasuSet(
      inout vec2 direction,
      inout float lengthAccumulator,
      vec2 pp,
      bool bilinearS,
      bool bilinearT,
      bool bilinearU,
      bool bilinearV,
      float lumaA,
      float lumaB,
      float lumaC,
      float lumaD,
      float lumaE
    ) {
      float bilinearWeight = 0.0;
      if (bilinearS) {
        bilinearWeight = (1.0 - pp.x) * (1.0 - pp.y);
      }
      if (bilinearT) {
        bilinearWeight = pp.x * (1.0 - pp.y);
      }
      if (bilinearU) {
        bilinearWeight = (1.0 - pp.x) * pp.y;
      }
      if (bilinearV) {
        bilinearWeight = pp.x * pp.y;
      }

      float dc = lumaD - lumaC;
      float cb = lumaC - lumaB;
      float lenX = max(abs(dc), abs(cb));
      lenX = rcpSafe(lenX);
      float dirX = lumaD - lumaB;
      direction.x += dirX * bilinearWeight;
      lenX = saturate(abs(dirX) * lenX);
      lenX *= lenX;
      lengthAccumulator += lenX * bilinearWeight;

      float ec = lumaE - lumaC;
      float ca = lumaC - lumaA;
      float lenY = max(abs(ec), abs(ca));
      lenY = rcpSafe(lenY);
      float dirY = lumaE - lumaA;
      direction.y += dirY * bilinearWeight;
      lenY = saturate(abs(dirY) * lenY);
      lenY *= lenY;
      lengthAccumulator += lenY * bilinearWeight;
    }

    vec4 fsrEasu(ivec2 outputPixelCoord) {
      vec2 pp = vec2(outputPixelCoord) * (inputResolution / outputResolution) +
        (0.5 * inputResolution / outputResolution - 0.5);
      vec2 baseCoord = floor(pp);
      pp -= baseCoord;
      ivec2 basePixelCoord = ivec2(baseCoord);

      vec4 bColor = sampleInput(basePixelCoord + ivec2(0, -1));
      vec4 cColor = sampleInput(basePixelCoord + ivec2(1, -1));
      vec4 eColor = sampleInput(basePixelCoord + ivec2(-1, 0));
      vec4 fColor = sampleInput(basePixelCoord + ivec2(0, 0));
      vec4 gColor = sampleInput(basePixelCoord + ivec2(1, 0));
      vec4 hColor = sampleInput(basePixelCoord + ivec2(2, 0));
      vec4 iColor = sampleInput(basePixelCoord + ivec2(-1, 1));
      vec4 jColor = sampleInput(basePixelCoord + ivec2(0, 1));
      vec4 kColor = sampleInput(basePixelCoord + ivec2(1, 1));
      vec4 lColor = sampleInput(basePixelCoord + ivec2(2, 1));
      vec4 nColor = sampleInput(basePixelCoord + ivec2(0, 2));
      vec4 oColor = sampleInput(basePixelCoord + ivec2(1, 2));

      float bL = luma2(bColor.rgb);
      float cL = luma2(cColor.rgb);
      float iL = luma2(iColor.rgb);
      float jL = luma2(jColor.rgb);
      float fL = luma2(fColor.rgb);
      float eL = luma2(eColor.rgb);
      float kL = luma2(kColor.rgb);
      float lL = luma2(lColor.rgb);
      float hL = luma2(hColor.rgb);
      float gL = luma2(gColor.rgb);
      float oL = luma2(oColor.rgb);
      float nL = luma2(nColor.rgb);

      vec2 direction = vec2(0.0);
      float lengthAccumulator = 0.0;
      fsrEasuSet(direction, lengthAccumulator, pp, true, false, false, false, bL, eL, fL, gL, jL);
      fsrEasuSet(direction, lengthAccumulator, pp, false, true, false, false, cL, fL, gL, hL, kL);
      fsrEasuSet(direction, lengthAccumulator, pp, false, false, true, false, fL, iL, jL, kL, nL);
      fsrEasuSet(direction, lengthAccumulator, pp, false, false, false, true, gL, jL, kL, lL, oL);

      float directionLengthSquared = dot(direction, direction);
      bool isNearZeroDirection = directionLengthSquared < (1.0 / 32768.0);
      float inverseDirectionLength = isNearZeroDirection ? 1.0 : inversesqrt(directionLengthSquared);
      direction = isNearZeroDirection ? vec2(1.0, 0.0) : direction * inverseDirectionLength;

      float edgeAmount = lengthAccumulator * 0.5;
      edgeAmount *= edgeAmount;

      float stretch = dot(direction, direction) * rcpSafe(max(abs(direction.x), abs(direction.y)));
      vec2 anisotropicLength = vec2(
        1.0 + (stretch - 1.0) * edgeAmount,
        1.0 - 0.5 * edgeAmount
      );
      float lobe = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * edgeAmount;
      float clippingPoint = rcpSafe(lobe);

      vec4 min4 = min(min3(fColor, gColor, jColor), kColor);
      vec4 max4 = max(max3(fColor, gColor, jColor), kColor);

      vec4 accumulatedColor = vec4(0.0);
      float accumulatedWeight = 0.0;
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(0.0, -1.0) - pp, direction, anisotropicLength, lobe, clippingPoint, bColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(1.0, -1.0) - pp, direction, anisotropicLength, lobe, clippingPoint, cColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(-1.0, 1.0) - pp, direction, anisotropicLength, lobe, clippingPoint, iColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(0.0, 1.0) - pp, direction, anisotropicLength, lobe, clippingPoint, jColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(0.0, 0.0) - pp, direction, anisotropicLength, lobe, clippingPoint, fColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(-1.0, 0.0) - pp, direction, anisotropicLength, lobe, clippingPoint, eColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(1.0, 1.0) - pp, direction, anisotropicLength, lobe, clippingPoint, kColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(2.0, 1.0) - pp, direction, anisotropicLength, lobe, clippingPoint, lColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(2.0, 0.0) - pp, direction, anisotropicLength, lobe, clippingPoint, hColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(1.0, 0.0) - pp, direction, anisotropicLength, lobe, clippingPoint, gColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(1.0, 2.0) - pp, direction, anisotropicLength, lobe, clippingPoint, oColor);
      fsrEasuTap(accumulatedColor, accumulatedWeight, vec2(0.0, 2.0) - pp, direction, anisotropicLength, lobe, clippingPoint, nColor);

      vec4 filteredColor = accumulatedColor * rcpSafe(accumulatedWeight);
      return clamp(filteredColor, min4, max4);
    }

    void main() {
      ivec2 outputPixelCoord = ivec2(gl_FragCoord.xy);
      fragColor = fsrEasu(outputPixelCoord);
    }
  `;

  const rcasFragmentShader = `
    #version 300 es
    precision highp float;
    precision highp sampler2D;

    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler2D tInput;
    uniform vec2 outputResolution;
    uniform float sharpnessAttenuation;

    const float FSR_RCAS_LIMIT = 0.25 - (1.0 / 16.0);

    float rcpSafe(float value) {
      return 1.0 / (abs(value) > 1e-6 ? value : (value >= 0.0 ? 1e-6 : -1e-6));
    }

    float min3(float a, float b, float c) {
      return min(a, min(b, c));
    }

    float max3(float a, float b, float c) {
      return max(a, max(b, c));
    }

    ivec2 clampCoord(ivec2 pixelCoord) {
      return clamp(pixelCoord, ivec2(0), ivec2(outputResolution) - ivec2(1));
    }

    vec4 loadColor(ivec2 pixelCoord) {
      return texelFetch(tInput, clampCoord(pixelCoord), 0);
    }

    float luma2(vec3 color) {
      return color.b * 0.5 + (color.r * 0.5 + color.g);
    }

    vec4 fsrRcas(ivec2 outputPixelCoord) {
      vec3 b = loadColor(outputPixelCoord + ivec2(0, -1)).rgb;
      vec3 d = loadColor(outputPixelCoord + ivec2(-1, 0)).rgb;
      vec4 center = loadColor(outputPixelCoord);
      vec3 e = center.rgb;
      vec3 f = loadColor(outputPixelCoord + ivec2(1, 0)).rgb;
      vec3 h = loadColor(outputPixelCoord + ivec2(0, 1)).rgb;

      float bL = luma2(b);
      float dL = luma2(d);
      float eL = luma2(e);
      float fL = luma2(f);
      float hL = luma2(h);

      float noise = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
      float maxL = max(max3(bL, dL, eL), max(fL, hL));
      float minL = min(min3(bL, dL, eL), min(fL, hL));
      float denoise = clamp(abs(noise) * rcpSafe(maxL - minL), 0.0, 1.0);
      denoise = -0.5 * denoise + 1.0;

      vec3 minRing = min(min(min(b, d), f), h);
      vec3 maxRing = max(max(max(b, d), f), h);

      vec3 hitMin = min(minRing, e) * vec3(
        rcpSafe(4.0 * maxRing.r),
        rcpSafe(4.0 * maxRing.g),
        rcpSafe(4.0 * maxRing.b)
      );
      vec3 hitMax = (vec3(1.0) - max(maxRing, e)) * vec3(
        rcpSafe(4.0 * minRing.r - 4.0),
        rcpSafe(4.0 * minRing.g - 4.0),
        rcpSafe(4.0 * minRing.b - 4.0)
      );

      vec3 lobeRGB = max(-hitMin, hitMax);
      float lobe = max(-FSR_RCAS_LIMIT, min(max3(lobeRGB.r, lobeRGB.g, lobeRGB.b), 0.0));
      lobe *= exp2(-sharpnessAttenuation);
      lobe *= denoise;

      float reciprocalLobe = rcpSafe(4.0 * lobe + 1.0);
      vec3 sharpened = (lobe * (b + d + f + h) + e) * reciprocalLobe;

      return vec4(sharpened, center.a);
    }

    void main() {
      ivec2 outputPixelCoord = ivec2(gl_FragCoord.xy);
      fragColor = fsrRcas(outputPixelCoord);
    }
  `;

  export class Scene3DFSRUpscaler {
    private _config: Scene3DFSRUpscalerConfig;
    private _sourceRenderTarget: THREE.WebGLRenderTarget;
    private _upscaledRenderTarget: THREE.WebGLRenderTarget;
    private _fullScreenScene: THREE.Scene;
    private _fullScreenCamera: THREE.OrthographicCamera;
    private _fullScreenQuad: THREE.Mesh;
    private _easuMaterial: THREE.ShaderMaterial;
    private _rcasMaterial: THREE.ShaderMaterial;
    private _scaledInputSize: THREE.Vector2;
    private _outputSize: THREE.Vector2;
    private _previousViewport: THREE.Vector4;
    private _previousScissor: THREE.Vector4;

    constructor() {
      this._config = {
        enabled: false,
        renderScale: DEFAULT_RENDER_SCALE,
        sharpness: DEFAULT_SHARPNESS,
      };

      this._sourceRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        stencilBuffer: false,
      });
      this._sourceRenderTarget.texture.generateMipmaps = false;

      this._upscaledRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
      });
      this._upscaledRenderTarget.texture.generateMipmaps = false;

      this._easuMaterial = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          tInput: { value: null },
          inputResolution: { value: new THREE.Vector2(1, 1) },
          outputResolution: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: fullScreenVertexShader,
        fragmentShader: easuFragmentShader,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });

      this._rcasMaterial = new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          tInput: { value: null },
          outputResolution: { value: new THREE.Vector2(1, 1) },
          sharpnessAttenuation: { value: DEFAULT_SHARPNESS },
        },
        vertexShader: fullScreenVertexShader,
        fragmentShader: rcasFragmentShader,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });

      this._fullScreenScene = new THREE.Scene();
      this._fullScreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this._fullScreenQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        this._easuMaterial
      );
      this._fullScreenQuad.frustumCulled = false;
      this._fullScreenScene.add(this._fullScreenQuad);

      this._scaledInputSize = new THREE.Vector2(1, 1);
      this._outputSize = new THREE.Vector2(1, 1);
      this._previousViewport = new THREE.Vector4();
      this._previousScissor = new THREE.Vector4();
    }

    setConfig(
      enabled: boolean,
      renderScale: number,
      sharpness: number
    ): boolean {
      const nextConfig: Scene3DFSRUpscalerConfig = {
        enabled: !!enabled,
        renderScale: clampScene3DFSRRenderScale(renderScale),
        sharpness: clampScene3DFSRSharpness(sharpness),
      };

      const hasChanged =
        nextConfig.enabled !== this._config.enabled ||
        nextConfig.renderScale !== this._config.renderScale ||
        nextConfig.sharpness !== this._config.sharpness;

      this._config = nextConfig;
      return hasChanged;
    }

    getConfig(): Scene3DFSRUpscalerConfig {
      return {
        enabled: this._config.enabled,
        renderScale: this._config.renderScale,
        sharpness: this._config.sharpness,
      };
    }

    isEnabled(): boolean {
      return this._config.enabled;
    }

    getRenderScale(): number {
      return this._config.renderScale;
    }

    private _isSupported(threeRenderer: THREE.WebGLRenderer): boolean {
      return !!(threeRenderer.capabilities as any).isWebGL2;
    }

    private _computeScaledInputSize(
      threeRenderer: THREE.WebGLRenderer
    ): THREE.Vector2 {
      threeRenderer.getDrawingBufferSize(this._outputSize);
      this._scaledInputSize.set(
        Math.max(1, Math.round(this._outputSize.x * this._config.renderScale)),
        Math.max(1, Math.round(this._outputSize.y * this._config.renderScale))
      );
      return this._scaledInputSize;
    }

    private _ensureSourceRenderTargetSize(
      threeRenderer: THREE.WebGLRenderer,
      width: number,
      height: number
    ): void {
      if (
        this._sourceRenderTarget.width !== width ||
        this._sourceRenderTarget.height !== height
      ) {
        this._sourceRenderTarget.setSize(width, height);
      }
      this._sourceRenderTarget.texture.colorSpace =
        threeRenderer.outputColorSpace;
    }

    private _ensureUpscaledRenderTargetSize(
      threeRenderer: THREE.WebGLRenderer,
      width: number,
      height: number
    ): void {
      if (
        this._upscaledRenderTarget.width !== width ||
        this._upscaledRenderTarget.height !== height
      ) {
        this._upscaledRenderTarget.setSize(width, height);
      }
      this._upscaledRenderTarget.texture.colorSpace =
        threeRenderer.outputColorSpace;
    }

    renderSceneToSourceRenderTarget(
      threeRenderer: THREE.WebGLRenderer,
      threeScene: THREE.Scene,
      threeCamera: THREE.Camera
    ): THREE.WebGLRenderTarget | null {
      if (!this._config.enabled || !this._isSupported(threeRenderer)) {
        return null;
      }

      const scaledSize = this._computeScaledInputSize(threeRenderer);
      this._ensureSourceRenderTargetSize(
        threeRenderer,
        Math.round(scaledSize.x),
        Math.round(scaledSize.y)
      );

      const previousRenderTarget = threeRenderer.getRenderTarget();
      const previousAutoClear = threeRenderer.autoClear;
      const previousScissorTest = threeRenderer.getScissorTest();
      const previousXrEnabled = threeRenderer.xr.enabled;
      threeRenderer.getViewport(this._previousViewport);
      threeRenderer.getScissor(this._previousScissor);

      threeRenderer.xr.enabled = false;
      threeRenderer.autoClear = true;
      threeRenderer.setScissorTest(false);
      threeRenderer.setRenderTarget(this._sourceRenderTarget);
      threeRenderer.setViewport(
        0,
        0,
        this._sourceRenderTarget.width,
        this._sourceRenderTarget.height
      );
      threeRenderer.setScissor(
        0,
        0,
        this._sourceRenderTarget.width,
        this._sourceRenderTarget.height
      );
      threeRenderer.clear(true, true, true);
      threeRenderer.render(threeScene, threeCamera);

      threeRenderer.setRenderTarget(previousRenderTarget);
      threeRenderer.setViewport(this._previousViewport);
      threeRenderer.setScissor(this._previousScissor);
      threeRenderer.setScissorTest(previousScissorTest);
      threeRenderer.autoClear = previousAutoClear;
      threeRenderer.xr.enabled = previousXrEnabled;

      return this._sourceRenderTarget;
    }

    renderFromSource(
      threeRenderer: THREE.WebGLRenderer,
      sourceTexture: THREE.Texture,
      sourceWidth: number,
      sourceHeight: number
    ): boolean {
      if (!this._config.enabled || !this._isSupported(threeRenderer)) {
        return false;
      }
      if (!sourceTexture || sourceWidth <= 0 || sourceHeight <= 0) {
        return false;
      }

      threeRenderer.getDrawingBufferSize(this._outputSize);
      const outputWidth = Math.max(1, Math.round(this._outputSize.x));
      const outputHeight = Math.max(1, Math.round(this._outputSize.y));
      this._ensureUpscaledRenderTargetSize(
        threeRenderer,
        outputWidth,
        outputHeight
      );

      const previousRenderTarget = threeRenderer.getRenderTarget();
      const previousAutoClear = threeRenderer.autoClear;
      const previousScissorTest = threeRenderer.getScissorTest();
      const previousXrEnabled = threeRenderer.xr.enabled;
      threeRenderer.getViewport(this._previousViewport);
      threeRenderer.getScissor(this._previousScissor);

      threeRenderer.xr.enabled = false;
      threeRenderer.autoClear = true;
      threeRenderer.setScissorTest(false);

      this._easuMaterial.uniforms.tInput.value = sourceTexture;
      this._easuMaterial.uniforms.inputResolution.value.set(
        sourceWidth,
        sourceHeight
      );
      this._easuMaterial.uniforms.outputResolution.value.set(
        outputWidth,
        outputHeight
      );
      this._fullScreenQuad.material = this._easuMaterial;

      threeRenderer.setRenderTarget(this._upscaledRenderTarget);
      threeRenderer.setViewport(0, 0, outputWidth, outputHeight);
      threeRenderer.setScissor(0, 0, outputWidth, outputHeight);
      threeRenderer.clear(true, false, false);
      threeRenderer.render(this._fullScreenScene, this._fullScreenCamera);

      this._rcasMaterial.uniforms.tInput.value =
        this._upscaledRenderTarget.texture;
      this._rcasMaterial.uniforms.outputResolution.value.set(
        outputWidth,
        outputHeight
      );
      this._rcasMaterial.uniforms.sharpnessAttenuation.value =
        this._config.sharpness;
      this._fullScreenQuad.material = this._rcasMaterial;

      threeRenderer.setRenderTarget(null);
      threeRenderer.setViewport(this._previousViewport);
      threeRenderer.setScissor(this._previousScissor);
      threeRenderer.render(this._fullScreenScene, this._fullScreenCamera);

      threeRenderer.setRenderTarget(previousRenderTarget);
      threeRenderer.setViewport(this._previousViewport);
      threeRenderer.setScissor(this._previousScissor);
      threeRenderer.setScissorTest(previousScissorTest);
      threeRenderer.autoClear = previousAutoClear;
      threeRenderer.xr.enabled = previousXrEnabled;

      return true;
    }
  }
}
