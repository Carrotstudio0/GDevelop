namespace gdjs {
  interface FSRUpscalerNetworkSyncData {
    e: boolean;
    r: number;
    s: number;
  }

  gdjs.PixiFiltersTools.registerFilterCreator(
    'Scene3D::FSRUpscaler',
    new (class implements gdjs.PixiFiltersTools.FilterCreator {
      makeFilter(
        target: EffectsTarget,
        effectData: EffectData
      ): gdjs.PixiFiltersTools.Filter {
        if (typeof THREE === 'undefined') {
          return new gdjs.PixiFiltersTools.EmptyFilter();
        }

        return new (class implements gdjs.PixiFiltersTools.Filter {
          _isEnabled: boolean;
          _effectEnabled: boolean;
          _renderScale: number;
          _sharpness: number;

          constructor() {
            this._isEnabled = false;
            this._effectEnabled = true;
            this._renderScale = 0.75;
            this._sharpness = 0.8;
            void target;
            void effectData;
          }

          private _applyUpscalerConfig(target: EffectsTarget): boolean {
            if (!(target instanceof gdjs.Layer)) {
              return false;
            }

            const layerRenderer = target.getRenderer();
            layerRenderer.setScene3DFSRUpscalerConfig(
              this._effectEnabled,
              this._renderScale,
              this._sharpness
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
            }
            return this.removeEffect(target);
          }

          applyEffect(target: EffectsTarget): boolean {
            if (!(target instanceof gdjs.Layer)) {
              return false;
            }

            this._isEnabled = true;
            return this._applyUpscalerConfig(target);
          }

          removeEffect(target: EffectsTarget): boolean {
            if (!(target instanceof gdjs.Layer)) {
              return false;
            }

            this._isEnabled = false;
            target
              .getRenderer()
              .setScene3DFSRUpscalerConfig(
                false,
                this._renderScale,
                this._sharpness
              );
            return true;
          }

          updatePreRender(target: gdjs.EffectsTarget): any {
            if (!this._isEnabled) {
              return;
            }
            this._applyUpscalerConfig(target);
          }

          updateDoubleParameter(parameterName: string, value: number): void {
            if (parameterName === 'renderScale') {
              this._renderScale = gdjs.clampScene3DFSRRenderScale(value);
            } else if (parameterName === 'sharpness') {
              this._sharpness = gdjs.clampScene3DFSRSharpness(value);
            }
          }

          getDoubleParameter(parameterName: string): number {
            if (parameterName === 'renderScale') {
              return this._renderScale;
            }
            if (parameterName === 'sharpness') {
              return this._sharpness;
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
              this._effectEnabled = !!value;
            }
          }

          getNetworkSyncData(): FSRUpscalerNetworkSyncData {
            return {
              e: this._effectEnabled,
              r: this._renderScale,
              s: this._sharpness,
            };
          }

          updateFromNetworkSyncData(
            syncData: FSRUpscalerNetworkSyncData
          ): void {
            this._effectEnabled = !!syncData.e;
            this._renderScale = gdjs.clampScene3DFSRRenderScale(syncData.r);
            this._sharpness = gdjs.clampScene3DFSRSharpness(syncData.s);
          }
        })();
      }
    })()
  );
}
