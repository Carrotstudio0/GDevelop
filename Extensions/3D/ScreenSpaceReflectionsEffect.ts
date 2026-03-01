namespace gdjs {
  interface ScreenSpaceReflectionsNetworkSyncData {
    i: number;
    md: number;
    t: number;
    e: boolean;
  }

  const screenSpaceReflectionsShader = {
    uniforms: {
      tDiffuse: { value: null },
      tSceneColor: { value: null },
      tDepth: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      intensity: { value: 0.6 },
      maxDistance: { value: 400.0 },
      thickness: { value: 2.0 },
      maxSteps: { value: 40.0 },
      cameraProjectionMatrix: { value: new THREE.Matrix4() },
      cameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform sampler2D tDiffuse;
      uniform sampler2D tSceneColor;
      uniform sampler2D tDepth;
      uniform vec2 resolution;
      uniform float intensity;
      uniform float maxDistance;
      uniform float thickness;
      uniform float maxSteps;
      uniform mat4 cameraProjectionMatrix;
      uniform mat4 cameraProjectionMatrixInverse;
      varying vec2 vUv;

      const int SSR_STEPS = 64;
      const int SSR_REFINEMENT_STEPS = 5;

      vec3 viewPositionFromDepth(vec2 uv, float depth) {
        vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 view = cameraProjectionMatrixInverse * clip;
        return view.xyz / max(view.w, 0.00001);
      }

      vec3 reconstructNormal(vec2 uv, float depth) {
        vec2 texel = 1.0 / resolution;
        float depthRight = texture2D(tDepth, uv + vec2(texel.x, 0.0)).x;
        float depthUp = texture2D(tDepth, uv + vec2(0.0, texel.y)).x;

        vec3 center = viewPositionFromDepth(uv, depth);
        vec3 right = viewPositionFromDepth(uv + vec2(texel.x, 0.0), depthRight);
        vec3 up = viewPositionFromDepth(uv + vec2(0.0, texel.y), depthUp);

        vec3 normal = normalize(cross(right - center, up - center));
        if (dot(normal, -normalize(center)) < 0.0) {
          normal = -normal;
        }
        return normal;
      }

      vec2 projectToUv(vec3 viewPosition) {
        vec4 clip = cameraProjectionMatrix * vec4(viewPosition, 1.0);
        return clip.xy / max(clip.w, 0.00001) * 0.5 + 0.5;
      }

      float estimateRoughness(vec2 uv, vec3 centerColor, vec3 normal) {
        vec2 texel = 1.0 / resolution;
        vec3 rightColor = texture2D(tSceneColor, uv + vec2(texel.x, 0.0)).rgb;
        vec3 upColor = texture2D(tSceneColor, uv + vec2(0.0, texel.y)).rgb;
        float l0 = dot(centerColor, vec3(0.2126, 0.7152, 0.0722));
        float l1 = dot(rightColor, vec3(0.2126, 0.7152, 0.0722));
        float l2 = dot(upColor, vec3(0.2126, 0.7152, 0.0722));
        float colorVariance = clamp((abs(l0 - l1) + abs(l0 - l2)) * 2.5, 0.0, 1.0);
        float normalFlatness = 1.0 - clamp(abs(normal.z), 0.0, 1.0);
        return clamp(colorVariance * 0.75 + normalFlatness * 0.25, 0.0, 1.0);
      }

      vec4 refineHit(vec3 originVS, vec3 reflectedDirVS, vec3 lowPos, vec3 highPos, float roughness) {
        vec3 a = lowPos;
        vec3 b = highPos;
        vec3 mid = highPos;
        vec2 midUv = projectToUv(mid);

        for (int i = 0; i < SSR_REFINEMENT_STEPS; ++i) {
          mid = (a + b) * 0.5;
          midUv = projectToUv(mid);
          if (midUv.x <= 0.0 || midUv.x >= 1.0 || midUv.y <= 0.0 || midUv.y >= 1.0) {
            b = mid;
            continue;
          }
          float sampledDepth = texture2D(tDepth, midUv).x;
          vec3 depthViewPos = viewPositionFromDepth(midUv, sampledDepth);
          float depthDelta = depthViewPos.z - mid.z;
          float hitThickness = thickness + roughness * thickness * 1.5;
          if (depthDelta > -hitThickness) {
            b = mid;
          } else {
            a = mid;
          }
        }

        vec2 finalUv = projectToUv(mid);
        if (finalUv.x <= 0.0 || finalUv.x >= 1.0 || finalUv.y <= 0.0 || finalUv.y >= 1.0) {
          return vec4(0.0);
        }
        vec3 hitColor = texture2D(tSceneColor, finalUv).rgb;
        float hitDistance = length(mid - originVS);
        return vec4(hitColor, hitDistance);
      }

      vec4 traceReflection(vec3 originVS, vec3 reflectedDirVS, float roughness) {
        float clampedSteps = clamp(maxSteps, 8.0, float(SSR_STEPS));
        float stepSize = maxDistance / clampedSteps;
        vec3 rayPos = originVS;
        vec3 previousRayPos = rayPos;
        vec4 hit = vec4(0.0);

        for (int i = 0; i < SSR_STEPS; ++i) {
          if (float(i) >= clampedSteps) {
            break;
          }
          previousRayPos = rayPos;
          rayPos += reflectedDirVS * stepSize;

          vec2 uv = projectToUv(rayPos);
          if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {
            break;
          }

          float sampledDepth = texture2D(tDepth, uv).x;
          if (sampledDepth >= 1.0) {
            continue;
          }

          vec3 depthViewPos = viewPositionFromDepth(uv, sampledDepth);
          float depthDelta = abs(depthViewPos.z - rayPos.z);
          float hitThickness = thickness + roughness * thickness * 2.0;

          if (depthDelta <= hitThickness && depthViewPos.z <= rayPos.z + hitThickness) {
            hit = refineHit(
              originVS,
              reflectedDirVS,
              previousRayPos,
              rayPos,
              roughness
            );
            break;
          }
        }

        return hit;
      }

      void main() {
        vec4 baseColor = texture2D(tDiffuse, vUv);
        if (intensity <= 0.0 || maxDistance <= 0.0) {
          gl_FragColor = baseColor;
          return;
        }

        float depth = texture2D(tDepth, vUv).x;
        if (depth >= 1.0) {
          gl_FragColor = baseColor;
          return;
        }

        vec3 viewPos = viewPositionFromDepth(vUv, depth);
        vec3 normal = reconstructNormal(vUv, depth);
        vec3 viewDir = normalize(viewPos);
        vec3 reflectedDir = normalize(reflect(viewDir, normal));

        if (reflectedDir.z >= 0.0) {
          gl_FragColor = baseColor;
          return;
        }

        vec3 sourceColor = texture2D(tSceneColor, vUv).rgb;
        float roughness = estimateRoughness(vUv, sourceColor, normal);
        vec4 hit = traceReflection(viewPos, reflectedDir, roughness);
        vec3 reflectionColor = hit.rgb;
        float rayDistance = hit.a;
        if (rayDistance <= 0.0) {
          gl_FragColor = baseColor;
          return;
        }

        float fresnel = pow(1.0 - max(dot(normal, -normalize(viewPos)), 0.0), 5.0);
        float distanceFade = clamp(1.0 - rayDistance / maxDistance, 0.0, 1.0);
        float edgeFade =
          smoothstep(0.02, 0.15, vUv.x) *
          smoothstep(0.02, 0.15, vUv.y) *
          smoothstep(0.02, 0.15, 1.0 - vUv.x) *
          smoothstep(0.02, 0.15, 1.0 - vUv.y);
        float materialReflectivity = max(0.12, 1.0 - roughness);
        float reflectionStrength =
          intensity *
          materialReflectivity *
          (0.15 + 0.85 * fresnel) *
          distanceFade *
          edgeFade;

        gl_FragColor = vec4(
          baseColor.rgb + reflectionColor * reflectionStrength,
          baseColor.a
        );
      }
    `,
  };

  gdjs.PixiFiltersTools.registerFilterCreator(
    'Scene3D::ScreenSpaceReflections',
    new (class implements gdjs.PixiFiltersTools.FilterCreator {
      makeFilter(
        target: EffectsTarget,
        effectData: EffectData
      ): gdjs.PixiFiltersTools.Filter {
        if (typeof THREE === 'undefined') {
          return new gdjs.PixiFiltersTools.EmptyFilter();
        }
        return new (class implements gdjs.PixiFiltersTools.Filter {
          shaderPass: THREE_ADDONS.ShaderPass;
          _isEnabled: boolean;
          _effectEnabled: boolean;
          _intensity: number;
          _maxDistance: number;
          _thickness: number;
          _sceneRenderTarget: THREE.WebGLRenderTarget;
          _previousViewport: THREE.Vector4;
          _previousScissor: THREE.Vector4;
          _renderSize: THREE.Vector2;
          _captureScale: number;
          _raySteps: number;
          _frameTimeSmoothing: number;
          _framesSinceCapture: number;
          _captureIntervalFrames: number;

          constructor() {
            this.shaderPass = new THREE_ADDONS.ShaderPass(
              screenSpaceReflectionsShader
            );
            this._isEnabled = false;
            this._effectEnabled = true;
            this._intensity = 0.6;
            this._maxDistance = 400;
            this._thickness = 2;
            this._sceneRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
              minFilter: THREE.LinearFilter,
              magFilter: THREE.LinearFilter,
              format: THREE.RGBAFormat,
              depthBuffer: true,
              stencilBuffer: false,
            });
            this._sceneRenderTarget.texture.generateMipmaps = false;
            this._sceneRenderTarget.depthTexture = new THREE.DepthTexture(1, 1);
            this._sceneRenderTarget.depthTexture.format = THREE.DepthFormat;
            this._sceneRenderTarget.depthTexture.type = THREE.UnsignedIntType;
            this._sceneRenderTarget.depthTexture.needsUpdate = true;
            this.shaderPass.uniforms.tSceneColor.value =
              this._sceneRenderTarget.texture;
            this.shaderPass.uniforms.tDepth.value =
              this._sceneRenderTarget.depthTexture;
            this.shaderPass.enabled = true;
            this._previousViewport = new THREE.Vector4();
            this._previousScissor = new THREE.Vector4();
            this._renderSize = new THREE.Vector2();
            this._captureScale = 1.0;
            this._raySteps = 40;
            this._frameTimeSmoothing = 16.6;
            this._framesSinceCapture = 9999;
            this._captureIntervalFrames = 1;
          }

          isEnabled(target: EffectsTarget): boolean {
            return this._isEnabled;
          }
          setEnabled(target: EffectsTarget, enabled: boolean): boolean {
            if (this._isEnabled === enabled) {
              return true;
            }
            if (enabled) {
              return this.applyEffect(target);
            } else {
              return this.removeEffect(target);
            }
          }
          applyEffect(target: EffectsTarget): boolean {
            if (!(target instanceof gdjs.Layer)) {
              return false;
            }
            target.getRenderer().addPostProcessingPass(this.shaderPass);
            this._isEnabled = true;
            return true;
          }
          removeEffect(target: EffectsTarget): boolean {
            if (!(target instanceof gdjs.Layer)) {
              return false;
            }
            target.getRenderer().removePostProcessingPass(this.shaderPass);
            this._isEnabled = false;
            return true;
          }

          private _updateRenderTargetSize(
            target: gdjs.Layer,
            threeRenderer: THREE.WebGLRenderer
          ): void {
            threeRenderer.getDrawingBufferSize(this._renderSize);
            const width = Math.max(
              1,
              Math.round((this._renderSize.x || target.getWidth()) * this._captureScale)
            );
            const height = Math.max(
              1,
              Math.round((this._renderSize.y || target.getHeight()) * this._captureScale)
            );
            if (
              this._sceneRenderTarget.width !== width ||
              this._sceneRenderTarget.height !== height
            ) {
              this._sceneRenderTarget.setSize(width, height);
              if (this._sceneRenderTarget.depthTexture) {
                this._sceneRenderTarget.depthTexture.needsUpdate = true;
              }
            }

            this.shaderPass.uniforms.resolution.value.set(width, height);
            this.shaderPass.uniforms.tSceneColor.value =
              this._sceneRenderTarget.texture;
            this.shaderPass.uniforms.tDepth.value =
              this._sceneRenderTarget.depthTexture;
            this._sceneRenderTarget.texture.colorSpace =
              threeRenderer.outputColorSpace;
          }

          private _adaptQuality(target: gdjs.EffectsTarget): void {
            const elapsedTimeMs = Math.max(0, target.getElapsedTime());
            this._frameTimeSmoothing =
              this._frameTimeSmoothing * 0.9 + elapsedTimeMs * 0.1;

            if (this._frameTimeSmoothing > 22) {
              this._captureScale = Math.max(0.6, this._captureScale - 0.04);
              this._raySteps = Math.max(20, this._raySteps - 2);
            } else if (this._frameTimeSmoothing < 15) {
              this._captureScale = Math.min(1.0, this._captureScale + 0.02);
              this._raySteps = Math.min(48, this._raySteps + 1);
            }

            this._captureIntervalFrames =
              this._frameTimeSmoothing > 30
                ? 3
                : this._frameTimeSmoothing > 22
                  ? 2
                  : 1;
          }

          private _captureScene(
            threeRenderer: THREE.WebGLRenderer,
            scene: THREE.Scene,
            camera: THREE.Camera
          ): void {
            const previousRenderTarget = threeRenderer.getRenderTarget();
            const previousAutoClear = threeRenderer.autoClear;
            const previousScissorTest = threeRenderer.getScissorTest();
            const previousXrEnabled = threeRenderer.xr.enabled;
            threeRenderer.getViewport(this._previousViewport);
            threeRenderer.getScissor(this._previousScissor);

            threeRenderer.xr.enabled = false;
            threeRenderer.autoClear = true;
            threeRenderer.setRenderTarget(this._sceneRenderTarget);
            threeRenderer.clear(true, true, true);
            threeRenderer.render(scene, camera);

            threeRenderer.setRenderTarget(previousRenderTarget);
            threeRenderer.setViewport(this._previousViewport);
            threeRenderer.setScissor(this._previousScissor);
            threeRenderer.setScissorTest(previousScissorTest);
            threeRenderer.autoClear = previousAutoClear;
            threeRenderer.xr.enabled = previousXrEnabled;
          }

          updatePreRender(target: gdjs.EffectsTarget): any {
            if (!this._isEnabled || !this._effectEnabled) {
              return;
            }
            if (!(target instanceof gdjs.Layer)) {
              return;
            }

            const runtimeScene = target.getRuntimeScene();
            const threeRenderer = runtimeScene
              .getGame()
              .getRenderer()
              .getThreeRenderer();
            const layerRenderer = target.getRenderer();
            const threeScene = layerRenderer.getThreeScene();
            const threeCamera = layerRenderer.getThreeCamera();

            if (!threeRenderer || !threeScene || !threeCamera) {
              return;
            }

            this._adaptQuality(target);
            this._updateRenderTargetSize(target, threeRenderer);

            threeCamera.updateMatrixWorld();
            this.shaderPass.uniforms.cameraProjectionMatrix.value.copy(
              threeCamera.projectionMatrix
            );
            this.shaderPass.uniforms.cameraProjectionMatrixInverse.value.copy(
              threeCamera.projectionMatrixInverse
            );
            this.shaderPass.uniforms.intensity.value = this._intensity;
            this.shaderPass.uniforms.maxDistance.value = this._maxDistance;
            this.shaderPass.uniforms.thickness.value = this._thickness;
            this.shaderPass.uniforms.maxSteps.value = this._raySteps;

            this._framesSinceCapture += 1;
            if (this._framesSinceCapture >= this._captureIntervalFrames) {
              this._captureScene(threeRenderer, threeScene, threeCamera);
              this._framesSinceCapture = 0;
            }
          }
          updateDoubleParameter(parameterName: string, value: number): void {
            if (parameterName === 'intensity') {
              this._intensity = Math.max(0, value);
              this.shaderPass.uniforms.intensity.value = this._intensity;
            } else if (parameterName === 'maxDistance') {
              this._maxDistance = Math.max(0, value);
              this.shaderPass.uniforms.maxDistance.value = this._maxDistance;
            } else if (parameterName === 'thickness') {
              this._thickness = Math.max(0.0001, value);
              this.shaderPass.uniforms.thickness.value = this._thickness;
            }
          }
          getDoubleParameter(parameterName: string): number {
            if (parameterName === 'intensity') {
              return this._intensity;
            }
            if (parameterName === 'maxDistance') {
              return this._maxDistance;
            }
            if (parameterName === 'thickness') {
              return this._thickness;
            }
            return 0;
          }
          updateStringParameter(parameterName: string, value: string): void {}
          updateColorParameter(parameterName: string, value: number): void {}
          getColorParameter(parameterName: string): number {
            return 0;
          }
          updateBooleanParameter(parameterName: string, value: boolean): void {
            if (parameterName === 'enabled') {
              this._effectEnabled = value;
              this.shaderPass.enabled = value;
            }
          }
          getNetworkSyncData(): ScreenSpaceReflectionsNetworkSyncData {
            return {
              i: this._intensity,
              md: this._maxDistance,
              t: this._thickness,
              e: this._effectEnabled,
            };
          }
          updateFromNetworkSyncData(
            syncData: ScreenSpaceReflectionsNetworkSyncData
          ): void {
            this._intensity = syncData.i;
            this._maxDistance = syncData.md;
            this._thickness = syncData.t;
            this._effectEnabled = syncData.e;

            this.shaderPass.uniforms.intensity.value = this._intensity;
            this.shaderPass.uniforms.maxDistance.value = this._maxDistance;
            this.shaderPass.uniforms.thickness.value = this._thickness;
            this.shaderPass.enabled = this._effectEnabled;
          }
        })();
      }
    })()
  );
}
