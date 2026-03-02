namespace gdjs {
  interface DirectionalLightFilterNetworkSyncData {
    i: number;
    c: number;
    e: number;
    r: number;
    t: string;
    msb?: number;
    snb?: number;
    sr?: number;
    ss?: boolean;
    sss?: number;
    dfc?: number;
    fs?: number;
  }
  const shadowHelper = false;
  gdjs.PixiFiltersTools.registerFilterCreator(
    'Scene3D::DirectionalLight',
    new (class implements gdjs.PixiFiltersTools.FilterCreator {
      makeFilter(
        target: EffectsTarget,
        effectData: EffectData
      ): gdjs.PixiFiltersTools.Filter {
        if (typeof THREE === 'undefined') {
          return new gdjs.PixiFiltersTools.EmptyFilter();
        }
        return new (class implements gdjs.PixiFiltersTools.Filter {
          private _top: string = 'Z+';
          private _elevation: float = 45;
          private _rotation: float = 0;
          private _shadowMapSize: float = 1024;
          private _minimumShadowBias: float = 0;
          private _shadowNormalBias: float = 0.02;
          private _shadowRadius: float = 2;
          private _shadowStabilizationEnabled: boolean = true;
          private _shadowStabilizationStep: float = 0;
          private _distanceFromCamera: float = 1500;
          private _frustumSize: float = 4000;

          private _isEnabled: boolean = false;
          private _light: THREE.DirectionalLight;
          private _shadowMapDirty = true;
          private _shadowCameraDirty = true;
          private _shadowCameraHelper: THREE.CameraHelper | null;

          constructor() {
            this._light = new THREE.DirectionalLight();

            if (shadowHelper) {
              this._shadowCameraHelper = new THREE.CameraHelper(
                this._light.shadow.camera
              );
            } else {
              this._shadowCameraHelper = null;
            }

            this._light.shadow.camera.updateProjectionMatrix();
          }

          private _updateShadowCamera(): void {
            if (!this._shadowCameraDirty) {
              return;
            }
            this._shadowCameraDirty = false;

            const safeDistanceFromCamera = Math.max(10, this._distanceFromCamera);
            const safeFrustumSize = Math.max(64, this._frustumSize);
            this._distanceFromCamera = safeDistanceFromCamera;
            this._frustumSize = safeFrustumSize;

            this._light.shadow.camera.near = 1;
            this._light.shadow.camera.far = safeDistanceFromCamera + 10000;
            this._light.shadow.camera.right = safeFrustumSize / 2;
            this._light.shadow.camera.left = -safeFrustumSize / 2;
            this._light.shadow.camera.top = safeFrustumSize / 2;
            this._light.shadow.camera.bottom = -safeFrustumSize / 2;
            this._light.shadow.camera.updateProjectionMatrix();
          }

          private _updateShadowMapSize(): void {
            if (!this._shadowMapDirty) {
              return;
            }
            this._shadowMapDirty = false;

            this._light.shadow.mapSize.set(
              this._shadowMapSize,
              this._shadowMapSize
            );

            // Force the recreation of the shadow map texture:
            this._light.shadow.map?.dispose();
            this._light.shadow.map = null;
            this._light.shadow.needsUpdate = true;
          }

          private _getEffectiveShadowStabilizationStep(): float {
            if (!this._shadowStabilizationEnabled) {
              return 0;
            }
            if (this._shadowStabilizationStep > 0) {
              return this._shadowStabilizationStep;
            }
            return Math.max(1, this._frustumSize / Math.max(1, this._shadowMapSize));
          }

          private _stabilizeCoordinate(value: float, step: float): float {
            if (step <= 0) {
              return value;
            }
            return Math.round(value / step) * step;
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
            const scene = target.get3DRendererObject() as
              | THREE.Scene
              | null
              | undefined;
            if (!scene) {
              return false;
            }
            scene.add(this._light);
            scene.add(this._light.target);
            if (this._shadowCameraHelper) {
              scene.add(this._shadowCameraHelper);
            }

            this._isEnabled = true;
            return true;
          }
          removeEffect(target: EffectsTarget): boolean {
            const scene = target.get3DRendererObject() as
              | THREE.Scene
              | null
              | undefined;
            if (!scene) {
              return false;
            }
            scene.remove(this._light);
            scene.remove(this._light.target);
            if (this._shadowCameraHelper) {
              scene.remove(this._shadowCameraHelper);
            }
            this._isEnabled = false;
            return true;
          }
          updatePreRender(target: gdjs.EffectsTarget): any {
            // Apply update to the light position and its target.
            // By doing this, the shadows are "following" the GDevelop camera.
            if (!target.getRuntimeLayer) {
              return;
            }
            const layer = target.getRuntimeLayer();
            const x = layer.getCameraX();
            const y = layer.getCameraY();
            const z = layer.getCameraZ(layer.getInitialCamera3DFieldOfView());
            const stabilizationStep = this._getEffectiveShadowStabilizationStep();
            const roundedX = this._stabilizeCoordinate(x, stabilizationStep);
            const roundedY = this._stabilizeCoordinate(y, stabilizationStep);
            const roundedZ = this._stabilizeCoordinate(z, stabilizationStep);

            if (this._top === 'Y-') {
              const posLightX =
                roundedX +
                this._distanceFromCamera *
                  Math.cos(gdjs.toRad(-this._rotation + 90)) *
                  Math.cos(gdjs.toRad(this._elevation));
              const posLightY =
                roundedY -
                this._distanceFromCamera *
                  Math.sin(gdjs.toRad(this._elevation));
              const posLightZ =
                roundedZ +
                this._distanceFromCamera *
                  Math.sin(gdjs.toRad(-this._rotation + 90)) *
                  Math.cos(gdjs.toRad(this._elevation));
              this._light.position.set(posLightX, posLightY, posLightZ);
              this._light.target.position.set(roundedX, roundedY, roundedZ);
            } else {
              const posLightX =
                roundedX +
                this._distanceFromCamera *
                  Math.cos(gdjs.toRad(this._rotation)) *
                  Math.cos(gdjs.toRad(this._elevation));
              const posLightY =
                roundedY +
                this._distanceFromCamera *
                  Math.sin(gdjs.toRad(this._rotation)) *
                  Math.cos(gdjs.toRad(this._elevation));
              const posLightZ =
                roundedZ +
                this._distanceFromCamera *
                  Math.sin(gdjs.toRad(this._elevation));

              this._light.position.set(posLightX, posLightY, posLightZ);
              this._light.target.position.set(roundedX, roundedY, roundedZ);
            }

            if (!this._light.castShadow) {
              return;
            }

            // Apply any update to the camera or shadow map size.
            this._updateShadowCamera();
            this._updateShadowMapSize();

            // Avoid shadow acne due to depth buffer precision.
            const biasMultiplier =
              this._shadowMapSize < 1024
                ? 2
                : this._shadowMapSize < 2048
                  ? 1.25
                  : 1;
            this._light.shadow.bias =
              -Math.max(0, this._minimumShadowBias) * biasMultiplier;
            this._light.shadow.normalBias = Math.max(0, this._shadowNormalBias);
            this._light.shadow.radius = Math.max(0, this._shadowRadius);
          }
          updateDoubleParameter(parameterName: string, value: number): void {
            if (parameterName === 'intensity') {
              this._light.intensity = Math.max(0, value);
            } else if (parameterName === 'elevation') {
              this._elevation = value;
            } else if (parameterName === 'rotation') {
              this._rotation = value;
            } else if (parameterName === 'distanceFromCamera') {
              this._distanceFromCamera = Math.max(10, value);
              this._shadowCameraDirty = true;
            } else if (parameterName === 'frustumSize') {
              this._frustumSize = Math.max(64, value);
              this._shadowCameraDirty = true;
            } else if (parameterName === 'minimumShadowBias') {
              this._minimumShadowBias = Math.max(0, value);
            } else if (parameterName === 'shadowNormalBias') {
              this._shadowNormalBias = Math.max(0, value);
            } else if (parameterName === 'shadowRadius') {
              this._shadowRadius = Math.max(0, value);
            } else if (parameterName === 'shadowStabilizationStep') {
              this._shadowStabilizationStep = Math.max(0, value);
            }
          }
          getDoubleParameter(parameterName: string): number {
            if (parameterName === 'intensity') {
              return this._light.intensity;
            } else if (parameterName === 'elevation') {
              return this._elevation;
            } else if (parameterName === 'rotation') {
              return this._rotation;
            } else if (parameterName === 'distanceFromCamera') {
              return this._distanceFromCamera;
            } else if (parameterName === 'frustumSize') {
              return this._frustumSize;
            } else if (parameterName === 'minimumShadowBias') {
              return this._minimumShadowBias;
            } else if (parameterName === 'shadowNormalBias') {
              return this._shadowNormalBias;
            } else if (parameterName === 'shadowRadius') {
              return this._shadowRadius;
            } else if (parameterName === 'shadowStabilizationStep') {
              return this._shadowStabilizationStep;
            }
            return 0;
          }
          updateStringParameter(parameterName: string, value: string): void {
            if (parameterName === 'color') {
              this._light.color = new THREE.Color(
                gdjs.rgbOrHexStringToNumber(value)
              );
            }
            if (parameterName === 'top') {
              this._top = value;
            }
            if (parameterName === 'shadowQuality') {
              if (value === 'low' && this._shadowMapSize !== 512) {
                this._shadowMapSize = 512;
                this._shadowMapDirty = true;
                this._shadowCameraDirty = true;
              }
              if (value === 'medium' && this._shadowMapSize !== 1024) {
                this._shadowMapSize = 1024;
                this._shadowMapDirty = true;
                this._shadowCameraDirty = true;
              }
              if (value === 'high' && this._shadowMapSize !== 2048) {
                this._shadowMapSize = 2048;
                this._shadowMapDirty = true;
                this._shadowCameraDirty = true;
              }
            }
          }
          updateColorParameter(parameterName: string, value: number): void {
            if (parameterName === 'color') {
              this._light.color.setHex(value);
            }
          }
          getColorParameter(parameterName: string): number {
            if (parameterName === 'color') {
              return this._light.color.getHex();
            }
            return 0;
          }
          updateBooleanParameter(parameterName: string, value: boolean): void {
            if (parameterName === 'isCastingShadow') {
              this._light.castShadow = value;
              if (value) {
                this._shadowMapDirty = true;
                this._shadowCameraDirty = true;
              }
            } else if (parameterName === 'shadowStabilization') {
              this._shadowStabilizationEnabled = value;
            }
          }
          getNetworkSyncData(): DirectionalLightFilterNetworkSyncData {
            return {
              i: this._light.intensity,
              c: this._light.color.getHex(),
              e: this._elevation,
              r: this._rotation,
              t: this._top,
              msb: this._minimumShadowBias,
              snb: this._shadowNormalBias,
              sr: this._shadowRadius,
              ss: this._shadowStabilizationEnabled,
              sss: this._shadowStabilizationStep,
              dfc: this._distanceFromCamera,
              fs: this._frustumSize,
            };
          }
          updateFromNetworkSyncData(
            syncData: DirectionalLightFilterNetworkSyncData
          ): void {
            this._light.intensity = syncData.i;
            this._light.color.setHex(syncData.c);
            this._elevation = syncData.e;
            this._rotation = syncData.r;
            this._top = syncData.t;
            this._minimumShadowBias = Math.max(0, syncData.msb ?? 0);
            this._shadowNormalBias = Math.max(0, syncData.snb ?? 0.02);
            this._shadowRadius = Math.max(0, syncData.sr ?? 2);
            this._shadowStabilizationEnabled = syncData.ss ?? true;
            this._shadowStabilizationStep = Math.max(0, syncData.sss ?? 0);
            this._distanceFromCamera = Math.max(10, syncData.dfc ?? 1500);
            this._frustumSize = Math.max(64, syncData.fs ?? 4000);
            this._shadowMapDirty = true;
            this._shadowCameraDirty = true;
          }
        })();
      }
    })()
  );
}
