namespace gdjs {
  interface PointLightFilterNetworkSyncData {
    i: number;
    c: number;
    x: number;
    y: number;
    z: number;
    d: number;
    dc: number;
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

          private _isEnabled: boolean = false;
          private _light: THREE.PointLight;
          private _shadowMapDirty = true;

          constructor() {
            this._light = new THREE.PointLight();
            this._light.position.set(
              this._positionX,
              this._positionY,
              this._positionZ
            );
            this._light.distance = this._distance;
            this._light.decay = this._decay;
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

          private _updatePosition(): void {
            if (this._top === 'Y-') {
              // GDevelop Y- convention: Y is flipped, Z is depth
              this._light.position.set(
                this._positionX,
                -this._positionZ,
                this._positionY
              );
            } else {
              // GDevelop Z+ convention: Z is up
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
            this._updateShadowMapSize();
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
            } else if (parameterName === 'decay') {
              this._decay = value;
              this._light.decay = value;
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
            this._light.distance = syncData.d;
            this._light.decay = syncData.dc;
            this._updatePosition();
          }
        })();
      }
    })()
  );
}
