import React, { useEffect, useRef, useState, createContext } from 'react';
import { IGlobeOptions, IDrawOptions } from './types';
import { useObservable, useObservableDict } from './utils/hooks';
import { ObservableDict } from './utils/ObservableDict';
import { Globe } from './Globe';
import Renderer from './Renderer';
import { mat4, vec3 } from 'gl-matrix';
import { useWindowSize } from 'react-use';
import { random } from 'lodash';
import { intersectTriangle, getLatLng } from './utils';
import classNames from 'classnames';

(window as any)._ = require('lodash');

let drawMode = 'centroid';

const initialOptions: IGlobeOptions = {
  seed: 123,
  numberCells: 35_000,
  jitter: 0.6,
  numberPlates: 12,
  flowModifier: 0.2,
  oceanPlatePercent: 0.7,
};

const initialDrawOptions: IDrawOptions = {
  grid: false,
  plateBorders: false,
  plateVectors: false,
  rivers: true,
  cellCenters: false,
  surface: true,
};

class GameManager {
  options$: ObservableDict<IGlobeOptions>;
  drawOptions$: ObservableDict<IDrawOptions>;
  renderer: ReturnType<typeof Renderer>;
  camera: any;
  globe: Globe;

  removeDrawLoop: any;
  hoveredCell: any;
  minimapContext: CanvasRenderingContext2D;

  constructor(screenCanvas: HTMLCanvasElement, public minimapCanvas: HTMLCanvasElement) {
    this.options$ = new ObservableDict(initialOptions);
    this.drawOptions$ = new ObservableDict(initialDrawOptions);

    this.hoveredCell = null;
    
    const renderer = Renderer(
      screenCanvas,
      minimapCanvas,
      this.onLoad(screenCanvas)
    );
    this.renderer = renderer;
    this.drawOptions$.subscribe(() => renderer.camera.setDirty());
    this.removeDrawLoop = renderer.regl.frame(() => {
      renderer.camera.run((state) => {
        if (!state.dirty) return;
        renderer.regl.clear({ color: [0, 0, 0, 1], depth: 1 });
        this.draw();
      });
    });
    (window as any).manager = this;
    (window as any).renderer = renderer;
    
    this.generate();
    (window as any).globe = this.globe;
  }
  
  onLoad = (canvas) => () => {
    let isPanning = false;
    canvas.addEventListener('mouseup', () => isPanning = false );
    canvas.addEventListener('mousedown', (event) => {
      if (this.hoveredCell && event.shiftKey) {
        const { r_xyz } = this.globe;
        const h_xyz = [r_xyz[3 * this.hoveredCell], r_xyz[3 * this.hoveredCell + 1], r_xyz[3 * this.hoveredCell + 2]];
        console.log(h_xyz);
        const [long, lat] = getLatLng(h_xyz);
        console.log(lat, long);
        this.renderer.camera.centerLatLong(lat, long);
      }
      isPanning = true;
      this.hoveredCell = null;
    });
    canvas.addEventListener('mousemove', (event) => {
      if (event.shiftKey || isPanning) return;
      const { left, top } = canvas.getBoundingClientRect();
      const { clientX, clientY } = event;
      const mouseX = clientX - left;
      const mouseY = clientY - top;
      const { projection, view } = this.renderer.camera.state;
      const vp = mat4.multiply([] as any, projection, view);
      let invVp = mat4.invert([] as any, vp);

      // get a single point on the camera ray.
      const rayPoint = vec3.transformMat4(
        [] as any,
        [
          2.0 * mouseX / canvas.width - 1.0,
          -2.0 * mouseY / canvas.height + 1.0,
          0.0
        ],
        invVp,
      );
      // get the position of the camera.
      const rayOrigin = vec3.transformMat4([] as any, [0, 0, 0], mat4.invert([] as any, view));
      const rayDir = vec3.negate([] as any, vec3.normalize([] as any, vec3.subtract([] as any, rayPoint, rayOrigin)));

      const { mesh, t_xyz, r_xyz } = this.globe;
      let sides = [];
      let maxT = -1e10;
      this.hoveredCell = null;
      for (let s = 0; s < mesh.numSides; s++) {
        const inner_t = mesh.s_inner_t(s);
        const outer_t = mesh.s_outer_t(s);
        const begin_r = mesh.s_begin_r(s);
        const x = vec3.fromValues(t_xyz[3 * inner_t], t_xyz[3 * inner_t + 1], t_xyz[3 * inner_t + 2]);
        const y = vec3.fromValues(t_xyz[3 * outer_t], t_xyz[3 * outer_t + 1], t_xyz[3 * outer_t + 2]);
        const z = vec3.fromValues(r_xyz[3 * begin_r], r_xyz[3 * begin_r + 1], r_xyz[3 * begin_r + 2]);
        const tri = [x, y, z];

        let out = [];
        const t = intersectTriangle(out, rayPoint, rayDir, tri);
        if (t !== null) {
          // console.log(s, t, out);
          if (t > maxT) {
            maxT = t;
            this.hoveredCell = mesh.s_begin_r(s);
            break;
          }
        }
      }
      this.renderer.camera.setDirty();
    });
  }

  destroy() {
    this.removeDrawLoop();
  }

  resetCamera() {
    this.destroy();
  }

  generate() {
    const globe = new Globe(this.options$.toObject() as any);
    this.globe = globe;
    this.renderer.camera.setDirty();
    this.drawMinimap();
  }

  draw() {
    const { mesh, triangleGeometry, minimapGeometry, quadGeometry, r_xyz } = this.globe;

    if (this.drawOptions$.get('surface')) {
      if (drawMode === 'centroid') {
        this.renderer.renderTriangles({
          a_xyz: triangleGeometry.xyz,
          a_tm: triangleGeometry.tm,
          count: triangleGeometry.xyz.length / 3,
        });
      } else if (drawMode === 'quads') {
        this.renderer.renderIndexedTriangles({
          a_xyz: quadGeometry.xyz,
          a_tm: quadGeometry.tm,
          elements: quadGeometry.I,
        } as any);
      }
    }

    if (this.drawOptions$.get('rivers')) {
      this.renderer.drawRivers(
        mesh,
        this.globe,
        0.5
      );
    }

    if (this.drawOptions$.get('plateVectors')) {
      this.renderer.drawPlateVectors(mesh, this.globe, this.options$.toObject());
    }
    if (this.drawOptions$.get('plateBorders')) {
      this.renderer.drawPlateBoundaries(mesh, this.globe);
    }

    if (this.drawOptions$.get('grid')) {
      this.renderer.drawCellBorders(mesh, this.globe);
    }

    if (this.drawOptions$.get('cellCenters')) {
      let u_pointsize = 10.0 + (100 / Math.sqrt(this.options$.get('numberCells')));
      this.renderer.renderPoints({
        u_pointsize,
        a_xyz: r_xyz,
        count: mesh.numRegions,
      });
    }

    if (this.hoveredCell) {
      this.renderer.drawCell(
        mesh,
        this.globe,
        this.hoveredCell,
      );
    }

  }

  drawMinimap() {
    const { minimapGeometry } = this.globe;

    // draw minimap
    this.renderer.renderMinimap({
      a_xy: minimapGeometry.xy,
      a_tm: minimapGeometry.tm,
      count: minimapGeometry.xy.length / 2,
    });
  }
}

function Input({
  value,
  onChange,
  ...restProps
}) {
  const [_value, setValue] = useState(value);
  useEffect(() => {
    setValue(value);
  }, [value]);
  return (
    <input
      value={_value}
      onChange={event => setValue(event.target.value)}
      onBlur={() => onChange(_value)}
      onKeyDown={event => event.keyCode === 13 && onChange(_value)}
      style={{
        flex: 1,
      }}
      {...restProps}
    />
  )
}

function Field({ title, children }) {
  return (
    <label className="field">
      <span className="field__title">
        {title}
      </span>
      {children}
    </label>
  );
}

function Tabs({ children }) {
  const tabs = children();
  const firstTab = Object.keys(tabs)[0];
  const [activeTab, setActiveTab] = useState(firstTab);
  return (
    <div>
      <div className="tab-row">
        {Object.keys(tabs).map(tabID => (
          <a
            key={tabID}
            className={classNames(
              'tab',
              activeTab === tabID && 'tab--active'
            )}
            onClick={() => setActiveTab(tabID)}>
            {tabs[tabID].title}
          </a>
        ))}
      </div>
      <div>
        {tabs[activeTab].render()}
      </div>
    </div>
  )
}

function Controls({ manager }: { manager: GameManager }) {
  const seed = useObservableDict(manager.options$, 'seed');
  const cells = useObservableDict(manager.options$, 'numberCells');
  const jitter = useObservableDict(manager.options$, 'jitter');
  const plates = useObservableDict(manager.options$, 'numberPlates');
  const flowModifier = useObservableDict(manager.options$, 'flowModifier');
  const oceanPlatePercent = useObservableDict(manager.options$, 'oceanPlatePercent');

  const drawGrid = useObservableDict(manager.drawOptions$, 'grid');
  const drawPlateVectors = useObservableDict(manager.drawOptions$, 'plateVectors');
  const drawPlateBorders = useObservableDict(manager.drawOptions$, 'plateBorders');
  const drawCellCenters = useObservableDict(manager.drawOptions$, 'cellCenters');
  const drawRivers = useObservableDict(manager.drawOptions$, 'rivers');
  const drawSurface = useObservableDict(manager.drawOptions$, 'surface');

  return (
    <div id="controls">
      <h1>Terra</h1>
      <Tabs>
        {() => ({
          generate: {
            title: 'Generate',
            render: () => (
              <div>
                <Field title="Seed">
                  <Input
                    type="number"
                    value={seed}
                    onChange={value => manager.options$.set('seed', value)}
                  />
                </Field>

                <Field title="Number of Cells">
                  <Input
                    type="number"
                    value={cells}
                    min={0}
                    onChange={value => manager.options$.set('numberCells', parseInt(value, 10))}
                  />
                </Field>

                <Field title="Cell Jitter">
                  <Input
                    type="number"
                    value={jitter}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={value => manager.options$.set('jitter', value)}
                  />
                </Field>

                <Field title="Number of Plates">
                  <Input
                    type="number"
                    value={plates}
                    min={0}
                    onChange={value => manager.options$.set('numberPlates', parseInt(value, 10))}
                  />
                </Field>

                <Field title="Flow modifier">
                  <Input
                    type="number"
                    value={flowModifier}
                    min={0}
                    max={1}
                    step={0.1}
                    onChange={value => manager.options$.set('flowModifier', value)}
                  />
                </Field>

                <Field title="Ocean Plate Percent">
                  <Input
                    type="number"
                    value={oceanPlatePercent}
                    min={0}
                    max={1}
                    step={0.1}
                    onChange={value => manager.options$.set('oceanPlatePercent', value)}
                  />
                </Field>
              </div>
            )
          },
          render: {
            title: 'Render',
            render: () => (
              <div>
                <Field title="Draw Grid">
                <input
                  type="checkbox"
                  checked={drawGrid}
                  onChange={event => manager.drawOptions$.set('grid', event.target.checked)}
                />
              </Field>

              <Field title="Draw Plate Borders">
                <input
                  type="checkbox"
                  checked={drawPlateBorders}
                  onChange={event => manager.drawOptions$.set('plateBorders', event.target.checked)}
                />
              </Field>

              <Field title="Draw Plate Vectors">
                <input
                  type="checkbox"
                  checked={drawPlateVectors}
                  onChange={event => manager.drawOptions$.set('plateVectors', event.target.checked)}
                />
              </Field>

              <Field title="Draw Cell Centers">
                <input
                  type="checkbox"
                  checked={drawCellCenters}
                  onChange={event => manager.drawOptions$.set('cellCenters', event.target.checked)}
                />
              </Field>

              <Field title="Draw Rivers">
                <input
                  type="checkbox"
                  checked={drawRivers}
                  onChange={event => manager.drawOptions$.set('rivers', event.target.checked)}
                />
              </Field>

              <Field title="Draw Surface">
                <input
                  type="checkbox"
                  checked={drawSurface}
                  onChange={event => manager.drawOptions$.set('surface', event.target.checked)}
                />
              </Field>
              </div>
            )
          }
        })}
      </Tabs>
    </div>
  );
}

export function App() {
  const screenRef = useRef();
  const minimapRef = useRef();
  const [manager, setManager] = useState(null);

  useEffect(() => {
    const manager = new GameManager(screenRef.current, minimapRef.current);
    console.log('manager', manager);
    setManager(manager);

    manager.options$.subscribe(() => {
      manager.generate();
    });
  }, []);

  const { width, height } = useWindowSize();

  return (
    <div>
      {!manager && <div id="loading">Loading...</div>}
      <canvas
        ref={screenRef}
        width={width}
        height={height}
      />
      <canvas
        className="minimap"
        ref={minimapRef}
        width={360 * 5}
        height={180 * 5}
      />
      {manager && <Controls manager={manager} />}
    </div>
  );
}