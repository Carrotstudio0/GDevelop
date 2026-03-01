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
    sb: number;
    snb: number;
    sn: number;
    sf: number;
    ao?: string;
    ox?: number;
    oy?: number;
    oz?: number;
    tao?: string;
    tox?: number;
    toy?: number;
    toz?: number;
    ro?: boolean;
    pbe?: boolean;
    pbi?: number;
    pbd?: number;
    pbo?: number;
    pbcs?: boolean;
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
          private _shadowBias: float = -0.001;
          private _shadowNormalBias: float = 0.02;
          private _shadowNear: float = 1;
          private _shadowFar: float = 10000;
          private _attachedObjectName: string = '';
          private _attachedOffsetX: float = 0;
          private _attachedOffsetY: float = 0;
          private _attachedOffsetZ: float = 0;
          private _targetAttachedObjectName: string = '';
          private _targetAttachedOffsetX: float = 0;
          private _targetAttachedOffsetY: float = 0;
          private _targetAttachedOffsetZ: float = 0;
          private _rotateOffsetsWithObjectAngle: boolean = false;
          private _physicsBounceEnabled: boolean = false;
          private _physicsBounceIntensityScale: float = 0.35;
          private _physicsBounceDistance: float = 600;
          private _physicsBounceOriginOffset: float = 2;
          private _physicsBounceCastShadow: boolean = false;
          private _physicsBounceRaycastResult: gdjs.Physics3DRaycastResult = {
            hasHit: false,
            hitX: 0,
            hitY: 0,
            hitZ: 0,
            normalX: 0,
            normalY: 0,
            normalZ: 0,
            reflectionDirectionX: 0,
            reflectionDirectionY: 0,
            reflectionDirectionZ: 0,
            distance: 0,
            fraction: 0,
            hitBehavior: null,
          };

          private _isEnabled: boolean = false;
          private _light: THREE.SpotLight;
          private _bounceLight: THREE.SpotLight;
          private _shadowMapDirty = true;
          private _shadowCameraDirty = true;

          constructor() {
            this._light = new THREE.SpotLight();
            this._light.distance = this._distance;
            this._light.angle = gdjs.toRad(this._angle);
            this._light.penumbra = this._penumbra;
            this._light.decay = this._decay;
            this._updatePosition();
            this._updateTarget();

            this._bounceLight = new THREE.SpotLight();
            this._bounceLight.visible = false;
            this._bounceLight.castShadow = this._physicsBounceCastShadow;

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
            
            // FOV of shadow camera for SpotLight should match the light's angle (angle is half of fov)
            this._light.shadow.camera.fov = this._angle * 2;
            
            this._light.shadow.camera.updateProjectionMatrix();
          }

          private _setAnyPosition(
            threeObject: THREE.Object3D,
            x: float,
            y: float,
            z: float
          ): void {
            if (this._top === 'Y-') {
              threeObject.position.set(x, -z, y);
            } else {
              threeObject.position.set(x, y, z);
            }
          }

          private _getAnyPositionInGdCoordinates(
            threeObject: THREE.Object3D
          ): [float, float, float] {
            if (this._top === 'Y-') {
              return [
                threeObject.position.x,
                threeObject.position.z,
                -threeObject.position.y,
              ];
            }
            return [
              threeObject.position.x,
              threeObject.position.y,
              threeObject.position.z,
            ];
          }

          private _setLightPosition(x: float, y: float, z: float): void {
            this._setAnyPosition(this._light, x, y, z);
          }

          private _updatePosition(): void {
            this._setLightPosition(
              this._positionX,
              this._positionY,
              this._positionZ
            );
          }

          private _setTargetPosition(x: float, y: float, z: float): void {
            this._setAnyPosition(this._light.target, x, y, z);
          }

          private _updateTarget(): void {
            this._setTargetPosition(
              this._targetX,
              this._targetY,
              this._targetZ
            );
          }

          private _hideBounceLight(): void {
            this._bounceLight.visible = false;
          }

          private _updatePhysicsBounce(target: gdjs.EffectsTarget): void {
            if (!this._physicsBounceEnabled) {
              this._hideBounceLight();
              return;
            }

            const runtimeScene = target.getRuntimeScene() as gdjs.RuntimeScene;
            if (!runtimeScene) {
              this._hideBounceLight();
              return;
            }

            const physics3DRuntimeBehaviorClass = (gdjs as unknown as {
              Physics3DRuntimeBehavior?: {
                raycastClosestInScene?: (
                  runtimeScene: gdjs.RuntimeScene,
                  startX: float,
                  startY: float,
                  startZ: float,
                  endX: float,
                  endY: float,
                  endZ: float,
                  ignoreBehavior: gdjs.Physics3DRuntimeBehavior | null,
                  outResult: gdjs.Physics3DRaycastResult
                ) => gdjs.Physics3DRaycastResult;
              };
            }).Physics3DRuntimeBehavior;
            const raycastClosestInScene =
              physics3DRuntimeBehaviorClass &&
              physics3DRuntimeBehaviorClass.raycastClosestInScene;

            if (!raycastClosestInScene) {
              this._hideBounceLight();
              return;
            }

            const [startX, startY, startZ] = this._getAnyPositionInGdCoordinates(
              this._light
            );
            const [targetX, targetY, targetZ] =
              this._getAnyPositionInGdCoordinates(this._light.target);

            const raycastResult = raycastClosestInScene(
              runtimeScene,
              startX,
              startY,
              startZ,
              targetX,
              targetY,
              targetZ,
              null,
              this._physicsBounceRaycastResult
            );
            if (!raycastResult.hasHit) {
              this._hideBounceLight();
              return;
            }

            const offsetX =
              raycastResult.hitX +
              raycastResult.normalX * this._physicsBounceOriginOffset;
            const offsetY =
              raycastResult.hitY +
              raycastResult.normalY * this._physicsBounceOriginOffset;
            const offsetZ =
              raycastResult.hitZ +
              raycastResult.normalZ * this._physicsBounceOriginOffset;

            const bouncedTargetX =
              offsetX +
              raycastResult.reflectionDirectionX * this._physicsBounceDistance;
            const bouncedTargetY =
              offsetY +
              raycastResult.reflectionDirectionY * this._physicsBounceDistance;
            const bouncedTargetZ =
              offsetZ +
              raycastResult.reflectionDirectionZ * this._physicsBounceDistance;

            this._setAnyPosition(this._bounceLight, offsetX, offsetY, offsetZ);
            this._setAnyPosition(
              this._bounceLight.target,
              bouncedTargetX,
              bouncedTargetY,
              bouncedTargetZ
            );
            this._bounceLight.color.copy(this._light.color);
            this._bounceLight.intensity =
              this._light.intensity * this._physicsBounceIntensityScale;
            this._bounceLight.distance = this._physicsBounceDistance;
            this._bounceLight.angle = this._light.angle;
            this._bounceLight.penumbra = this._light.penumbra;
            this._bounceLight.decay = this._light.decay;
            this._bounceLight.castShadow = this._physicsBounceCastShadow;
            this._bounceLight.visible = true;
          }

          private _getFirstObjectByName(
            target: EffectsTarget,
            objectName: string
          ): gdjs.RuntimeObject | null {
            if (!objectName) {
              return null;
            }
            const objects = target.getRuntimeScene().getObjects(objectName);
            if (!objects || objects.length === 0) {
              return null;
            }
            return objects[0];
          }

          private _getObjectCenterZ(object: gdjs.RuntimeObject): float {
            const object3D = object as gdjs.RuntimeObject & {
              getCenterZInScene?: () => float;
            };
            return typeof object3D.getCenterZInScene === 'function'
              ? object3D.getCenterZInScene()
              : 0;
          }

          private _getRotatedOffsets(
            object: gdjs.RuntimeObject,
            offsetX: float,
            offsetY: float
          ): [float, float] {
            if (!this._rotateOffsetsWithObjectAngle) {
              return [offsetX, offsetY];
            }
            const angleRad = gdjs.toRad(object.getAngle());
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            return [
              offsetX * cos - offsetY * sin,
              offsetX * sin + offsetY * cos,
            ];
          }

          private _applyAttachedPosition(target: EffectsTarget): boolean {
            const attachedObject = this._getFirstObjectByName(
              target,
              this._attachedObjectName
            );
            if (!attachedObject) {
              return false;
            }
            const [offsetX, offsetY] = this._getRotatedOffsets(
              attachedObject,
              this._attachedOffsetX,
              this._attachedOffsetY
            );
            this._setLightPosition(
              attachedObject.getCenterXInScene() + offsetX,
              attachedObject.getCenterYInScene() + offsetY,
              this._getObjectCenterZ(attachedObject) + this._attachedOffsetZ
            );
            return true;
          }

          private _applyAttachedTarget(target: EffectsTarget): boolean {
            const attachedObject = this._getFirstObjectByName(
              target,
              this._targetAttachedObjectName
            );
            if (!attachedObject) {
              return false;
            }
            const [offsetX, offsetY] = this._getRotatedOffsets(
              attachedObject,
              this._targetAttachedOffsetX,
              this._targetAttachedOffsetY
            );
            this._setTargetPosition(
              attachedObject.getCenterXInScene() + offsetX,
              attachedObject.getCenterYInScene() + offsetY,
              this._getObjectCenterZ(attachedObject) +
                this._targetAttachedOffsetZ
            );
            return true;
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
            scene.add(this._bounceLight);
            scene.add(this._bounceLight.target);
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
            scene.remove(this._bounceLight);
            scene.remove(this._bounceLight.target);
            this._isEnabled = false;
            return true;
          }
          updatePreRender(target: gdjs.EffectsTarget): any {
            if (
              !this._applyAttachedPosition(target) &&
              this._attachedObjectName !== ''
            ) {
              this._updatePosition();
            }
            if (
              !this._applyAttachedTarget(target) &&
              this._targetAttachedObjectName !== ''
            ) {
              this._updateTarget();
            }
            this._updateShadowCamera();
            this._updateShadowMapSize();

            this._light.shadow.bias = this._shadowBias;
            this._light.shadow.normalBias = this._shadowNormalBias;
            this._updatePhysicsBounce(target);
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
            } else if (parameterName === 'attachedOffsetX') {
              this._attachedOffsetX = value;
            } else if (parameterName === 'attachedOffsetY') {
              this._attachedOffsetY = value;
            } else if (parameterName === 'attachedOffsetZ') {
              this._attachedOffsetZ = value;
            } else if (parameterName === 'targetX') {
              this._targetX = value;
              this._updateTarget();
            } else if (parameterName === 'targetY') {
              this._targetY = value;
              this._updateTarget();
            } else if (parameterName === 'targetZ') {
              this._targetZ = value;
              this._updateTarget();
            } else if (parameterName === 'targetAttachedOffsetX') {
              this._targetAttachedOffsetX = value;
            } else if (parameterName === 'targetAttachedOffsetY') {
              this._targetAttachedOffsetY = value;
            } else if (parameterName === 'targetAttachedOffsetZ') {
              this._targetAttachedOffsetZ = value;
            } else if (parameterName === 'distance') {
              this._distance = value;
              this._light.distance = value;
              this._shadowCameraDirty = true;
            } else if (parameterName === 'angle') {
              this._angle = value;
              this._light.angle = gdjs.toRad(value);
              this._shadowCameraDirty = true;
            } else if (parameterName === 'penumbra') {
              this._penumbra = value;
              this._light.penumbra = value;
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
            } else if (parameterName === 'physicsBounceIntensityScale') {
              this._physicsBounceIntensityScale = value;
            } else if (parameterName === 'physicsBounceDistance') {
              this._physicsBounceDistance = value;
            } else if (parameterName === 'physicsBounceOriginOffset') {
              this._physicsBounceOriginOffset = value;
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
            } else if (parameterName === 'attachedOffsetX') {
              return this._attachedOffsetX;
            } else if (parameterName === 'attachedOffsetY') {
              return this._attachedOffsetY;
            } else if (parameterName === 'attachedOffsetZ') {
              return this._attachedOffsetZ;
            } else if (parameterName === 'targetX') {
              return this._targetX;
            } else if (parameterName === 'targetY') {
              return this._targetY;
            } else if (parameterName === 'targetZ') {
              return this._targetZ;
            } else if (parameterName === 'targetAttachedOffsetX') {
              return this._targetAttachedOffsetX;
            } else if (parameterName === 'targetAttachedOffsetY') {
              return this._targetAttachedOffsetY;
            } else if (parameterName === 'targetAttachedOffsetZ') {
              return this._targetAttachedOffsetZ;
            } else if (parameterName === 'distance') {
              return this._distance;
            } else if (parameterName === 'angle') {
              return this._angle;
            } else if (parameterName === 'penumbra') {
              return this._penumbra;
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
            } else if (parameterName === 'physicsBounceIntensityScale') {
              return this._physicsBounceIntensityScale;
            } else if (parameterName === 'physicsBounceDistance') {
              return this._physicsBounceDistance;
            } else if (parameterName === 'physicsBounceOriginOffset') {
              return this._physicsBounceOriginOffset;
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
            if (parameterName === 'attachedObject') {
              this._attachedObjectName = value;
            }
            if (parameterName === 'targetAttachedObject') {
              this._targetAttachedObjectName = value;
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
            } else if (parameterName === 'rotateOffsetsWithObjectAngle') {
              this._rotateOffsetsWithObjectAngle = value;
            } else if (parameterName === 'physicsBounceEnabled') {
              this._physicsBounceEnabled = value;
              if (!value) {
                this._hideBounceLight();
              }
            } else if (parameterName === 'physicsBounceCastShadow') {
              this._physicsBounceCastShadow = value;
              this._bounceLight.castShadow = value;
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
              sb: this._shadowBias,
              snb: this._shadowNormalBias,
              sn: this._shadowNear,
              sf: this._shadowFar,
              ao: this._attachedObjectName,
              ox: this._attachedOffsetX,
              oy: this._attachedOffsetY,
              oz: this._attachedOffsetZ,
              tao: this._targetAttachedObjectName,
              tox: this._targetAttachedOffsetX,
              toy: this._targetAttachedOffsetY,
              toz: this._targetAttachedOffsetZ,
              ro: this._rotateOffsetsWithObjectAngle,
              pbe: this._physicsBounceEnabled,
              pbi: this._physicsBounceIntensityScale,
              pbd: this._physicsBounceDistance,
              pbo: this._physicsBounceOriginOffset,
              pbcs: this._physicsBounceCastShadow,
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
            this._shadowBias = syncData.sb;
            this._shadowNormalBias = syncData.snb;
            this._shadowNear = syncData.sn;
            this._shadowFar = syncData.sf;
            this._attachedObjectName = syncData.ao || '';
            this._attachedOffsetX = syncData.ox ?? 0;
            this._attachedOffsetY = syncData.oy ?? 0;
            this._attachedOffsetZ = syncData.oz ?? 0;
            this._targetAttachedObjectName = syncData.tao || '';
            this._targetAttachedOffsetX = syncData.tox ?? 0;
            this._targetAttachedOffsetY = syncData.toy ?? 0;
            this._targetAttachedOffsetZ = syncData.toz ?? 0;
            this._rotateOffsetsWithObjectAngle = syncData.ro ?? false;
            this._physicsBounceEnabled = syncData.pbe ?? false;
            this._physicsBounceIntensityScale = syncData.pbi ?? 0.35;
            this._physicsBounceDistance = syncData.pbd ?? 600;
            this._physicsBounceOriginOffset = syncData.pbo ?? 2;
            this._physicsBounceCastShadow = syncData.pbcs ?? false;
            this._light.distance = syncData.d;
            this._light.angle = gdjs.toRad(syncData.a);
            this._light.penumbra = syncData.p;
            this._light.decay = syncData.dc;
            this._bounceLight.castShadow = this._physicsBounceCastShadow;
            if (!this._physicsBounceEnabled) {
              this._hideBounceLight();
            }
            this._updatePosition();
            this._updateTarget();
            this._shadowCameraDirty = true;
          }
        })();
      }
    })()
  );
}
