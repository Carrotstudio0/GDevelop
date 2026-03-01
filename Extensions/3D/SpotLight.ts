namespace gdjs {
  interface SpotLightFilterNetworkSyncData {
    i: number;
    c: number;
    px: number;
    py: number;
    pz: number;
    tx: number;
    ty: number;
    tz: number;
    d: number;
    a: number;
    p: number;
    dc: number;
  }
  gdjs.PixiFiltersTools.registerFilterCreator(
    'Scene3D::SpotLight',
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
          private _targetX: float = 0;
          private _targetY: float = 0;
          private _targetZ: float = 0;
          private _distance: float = 0;
          private _angle: float = 45;
          private _penumbra: float = 0.1;
          private _decay: float = 2;
          private _shadowMapSize: float = 1024;

          private _isEnabled: boolean = false;
          private _light: THREE.SpotLight;
          private _shadowMapDirty = true;

          constructor() {
            this._light = new THREE.SpotLight();
            this._light.distance = this._distance;
            this._light.angle = gdjs.toRad(this._angle);
            this._light.penumbra = this._penumbra;
            this._light.decay = this._decay;
            this._updatePosition();
            this._updateTarget();
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

          private _updateTarget(): void {
            if (this._top === 'Y-') {
              this._light.target.position.set(
                this._targetX,
                -this._targetZ,
                this._targetY
              );
            } else {
              this._light.target.position.set(
                this._targetX,
                this._targetY,
                this._targetZ
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
            scene.add(this._light.target);
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
            } else if (parameterName === 'targetX') {
              this._targetX = value;
              this._updateTarget();
            } else if (parameterName === 'targetY') {
              this._targetY = value;
              this._updateTarget();
            } else if (parameterName === 'targetZ') {
              this._targetZ = value;
              this._updateTarget();
            } else if (parameterName === 'distance') {
              this._distance = value;
              this._light.distance = value;
            } else if (parameterName === 'angle') {
              this._angle = value;
              this._light.angle = gdjs.toRad(value);
            } else if (parameterName === 'penumbra') {
              this._penumbra = value;
              this._light.penumbra = value;
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
            } else if (parameterName === 'targetX') {
              return this._targetX;
            } else if (parameterName === 'targetY') {
              return this._targetY;
            } else if (parameterName === 'targetZ') {
              return this._targetZ;
            } else if (parameterName === 'distance') {
              return this._distance;
            } else if (parameterName === 'angle') {
              return this._angle;
            } else if (parameterName === 'penumbra') {
              return this._penumbra;
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
              this._updateTarget();
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
          getNetworkSyncData(): SpotLightFilterNetworkSyncData {
            return {
              i: this._light.intensity,
              c: this._light.color.getHex(),
              px: this._positionX,
              py: this._positionY,
              pz: this._positionZ,
              tx: this._targetX,
              ty: this._targetY,
              tz: this._targetZ,
              d: this._distance,
              a: this._angle,
              p: this._penumbra,
              dc: this._decay,
            };
          }
          updateFromNetworkSyncData(
            syncData: SpotLightFilterNetworkSyncData
          ): void {
            this._light.intensity = syncData.i;
            this._light.color.setHex(syncData.c);
            this._positionX = syncData.px;
            this._positionY = syncData.py;
            this._positionZ = syncData.pz;
            this._targetX = syncData.tx;
            this._targetY = syncData.ty;
            this._targetZ = syncData.tz;
            this._distance = syncData.d;
            this._angle = syncData.a;
            this._penumbra = syncData.p;
            this._decay = syncData.dc;
            this._light.distance = syncData.d;
            this._light.angle = gdjs.toRad(syncData.a);
            this._light.penumbra = syncData.p;
            this._light.decay = syncData.dc;
            this._updatePosition();
            this._updateTarget();
          }
        })();
      }
    })()
  );
}
