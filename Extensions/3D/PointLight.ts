namespace gdjs {
  interface PointLightFilterNetworkSyncData {
    i: number;
    c: number;
    x: number;
    y: number;
    z: number;
    d: number;
    dc: number;
    sb: number;
    snb: number;
    sn: number;
    sf: number;
  }
  gdjs.PixiFiltersTools.registerFilterCreator(
    'Scene3D::PointLight',
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
          private _positionX: float = 0;
          private _positionY: float = 0;
          private _positionZ: float = 500;
          private _distance: float = 0;
          private _decay: float = 2;
          private _shadowMapSize: float = 1024;
          private _shadowBias: float = -0.001;
          private _shadowNormalBias: float = 0.02;
          private _shadowNear: float = 1;
          private _shadowFar: float = 10000;

          private _isEnabled: boolean = false;
          private _light: THREE.PointLight;
          private _shadowMapDirty = true;
          private _shadowCameraDirty = true;

          constructor() {
            this._light = new THREE.PointLight();
            this._light.position.set(
              this._positionX,
              this._positionY,
              this._positionZ
            );
            this._light.distance = this._distance;
            this._light.decay = this._decay;

            // Configure shadow defaults
            this._light.shadow.bias = this._shadowBias;
            this._light.shadow.normalBias = this._shadowNormalBias;
            this._light.shadow.camera.near = this._shadowNear;
            this._light.shadow.camera.far = this._shadowFar;
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

          private _updateShadowCamera(): void {
            if (!this._shadowCameraDirty) {
              return;
            }
            this._shadowCameraDirty = false;

            this._light.shadow.camera.near = this._shadowNear;
            
            // Auto-adjust far plane if distance is explicitly set
            const effectiveFar = (this._distance > 0) ? 
                Math.min(this._shadowFar, this._distance + 100) : 
                this._shadowFar;
            
            this._light.shadow.camera.far = effectiveFar;
            this._light.shadow.camera.updateProjectionMatrix();
          }

          private _updatePosition(): void {
            if (this._top === 'Y-') {
              this._light.position.set(
                this._positionX,
                -this._positionZ,
                this._positionY
              );
            } else {
              this._light.position.set(
                this._positionX,
                this._positionY,
                this._positionZ
              );
            }
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
            this._isEnabled = false;
            return true;
          }
          updatePreRender(target: gdjs.EffectsTarget): any {
            this._updateShadowCamera();
            this._updateShadowMapSize();

            this._light.shadow.bias = this._shadowBias;
            this._light.shadow.normalBias = this._shadowNormalBias;
          }
          updateDoubleParameter(parameterName: string, value: number): void {
            if (parameterName === 'intensity') {
              this._light.intensity = value;
            } else if (parameterName === 'positionX') {
              this._positionX = value;
              this._updatePosition();
            } else if (parameterName === 'positionY') {
              this._positionY = value;
              this._updatePosition();
            } else if (parameterName === 'positionZ') {
              this._positionZ = value;
              this._updatePosition();
            } else if (parameterName === 'distance') {
              this._distance = value;
              this._light.distance = value;
              this._shadowCameraDirty = true;
            } else if (parameterName === 'decay') {
              this._decay = value;
              this._light.decay = value;
            } else if (parameterName === 'shadowBias') {
              this._shadowBias = -value;
            } else if (parameterName === 'shadowNormalBias') {
              this._shadowNormalBias = value;
            } else if (parameterName === 'shadowNear') {
              this._shadowNear = value;
              this._shadowCameraDirty = true;
            } else if (parameterName === 'shadowFar') {
              this._shadowFar = value;
              this._shadowCameraDirty = true;
            }
          }
          getDoubleParameter(parameterName: string): number {
            if (parameterName === 'intensity') {
              return this._light.intensity;
            } else if (parameterName === 'positionX') {
              return this._positionX;
            } else if (parameterName === 'positionY') {
              return this._positionY;
            } else if (parameterName === 'positionZ') {
              return this._positionZ;
            } else if (parameterName === 'distance') {
              return this._distance;
            } else if (parameterName === 'decay') {
              return this._decay;
            } else if (parameterName === 'shadowBias') {
              return -this._shadowBias;
            } else if (parameterName === 'shadowNormalBias') {
              return this._shadowNormalBias;
            } else if (parameterName === 'shadowNear') {
              return this._shadowNear;
            } else if (parameterName === 'shadowFar') {
              return this._shadowFar;
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
              this._updatePosition();
            }
            if (parameterName === 'shadowQuality') {
              if (value === 'low' && this._shadowMapSize !== 512) {
                this._shadowMapSize = 512;
                this._shadowMapDirty = true;
              }
              if (value === 'medium' && this._shadowMapSize !== 1024) {
                this._shadowMapSize = 1024;
                this._shadowMapDirty = true;
              }
              if (value === 'high' && this._shadowMapSize !== 2048) {
                this._shadowMapSize = 2048;
                this._shadowMapDirty = true;
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
            }
          }
          getNetworkSyncData(): PointLightFilterNetworkSyncData {
            return {
              i: this._light.intensity,
              c: this._light.color.getHex(),
              x: this._positionX,
              y: this._positionY,
              z: this._positionZ,
              d: this._distance,
              dc: this._decay,
              sb: this._shadowBias,
              snb: this._shadowNormalBias,
              sn: this._shadowNear,
              sf: this._shadowFar,
            };
          }
          updateFromNetworkSyncData(
            syncData: PointLightFilterNetworkSyncData
          ): void {
            this._light.intensity = syncData.i;
            this._light.color.setHex(syncData.c);
            this._positionX = syncData.x;
            this._positionY = syncData.y;
            this._positionZ = syncData.z;
            this._distance = syncData.d;
            this._decay = syncData.dc;
            this._shadowBias = syncData.sb;
            this._shadowNormalBias = syncData.snb;
            this._shadowNear = syncData.sn;
            this._shadowFar = syncData.sf;
            this._light.distance = syncData.d;
            this._light.decay = syncData.dc;
            this._updatePosition();
            this._shadowCameraDirty = true;
          }
        })();
      }
    })()
  );
}
