import REGL = require('regl');
import * as colormap from './colormap';
import { vec3, mat4 } from 'gl-matrix';
import TriangleMesh from '@redblobgames/dual-mesh';
import createLine from 'regl-line';
import { IGlobeOptions } from './types';
import setupCamera from './camera';


type PointsUniforms = {
  u_pointsize: REGL.Mat4,
}

type PointsProps = {
  u_pointsize: number,
  count: number,
  a_xyz: number[],
}

type LinesUniforms = {
  scale: REGL.Mat4,
  u_multiply_rgba: REGL.Mat4,
  u_add_rgba: REGL.Mat4,
}

type LinesProps = {
  scale: mat4,
  u_multiply_rgba: number[],
  u_add_rgba: number[],
  count: number,
  a_xyz: number[],
  a_rgba: number[],
}

type TrianglesUniforms = {
  u_colormap: REGL.Texture,
}

type TrianglesProps = {
  u_colormap?: number[],
  count: number,
  a_xyz: number[],
  a_tm: number[],
}

type CellColorUniforms = {
  scale: REGL.Mat4,
}

type CellColorProps = {
  scale: mat4,
  a_rgba?: number[],
  a_xyz: number[],
  count: number,
}

type MinimapUniforms = {
  u_colormap_minimap: REGL.Texture
}

type MinimapProps = {
  u_colormap?: number[],
  count: number,
  a_xy: number[],
  a_tm: number[],
}

type IndexedTrianglesUniforms = {
  u_colormap: REGL.Texture,
  u_light_angle: REGL.Vec2,
  u_inverse_texture_size: number,
  u_d: number,
  u_c: number,
  u_slope: number,
  u_flat: number,
  u_outline_strength: number,
}

type IndexedTrianglesProps = {
  u_colormap?: number[],
  elements: Int32Array,
  a_xyz: number[],
  a_tm: number[],
}

export default function Renderer(
  screenCanvas: HTMLCanvasElement,
  minimapCanvas: HTMLCanvasElement,
  onLoad: () => void
) {
  const regl = REGL({
    canvas: screenCanvas,
    extensions: ['OES_element_index_uint', 'OES_standard_derivatives', 'ANGLE_instanced_arrays'],
    onDone: onLoad,
  });

  const reglMinimap = REGL({
    canvas: minimapCanvas,
    extensions: ['OES_element_index_uint', 'OES_standard_derivatives', 'ANGLE_instanced_arrays'],
  });

  const camera = setupCamera(regl, {
    center: [0, 0, 0],
    distance: 2,
    rotationSpeed: 0.8,
    damping: 0,
    fovy: Math.PI / 4.0,
    maxDistance: 3,
    minDistance: 1.2,
  });

  const u_colormap = regl.texture({
    width: colormap.width,
    height: colormap.height,
    data: colormap.data,
    wrapS: 'clamp',
    wrapT: 'clamp'
  });

  const u_colormap_minimap = reglMinimap.texture({
    width: colormap.width,
    height: colormap.height,
    data: colormap.data,
    wrapS: 'clamp',
    wrapT: 'clamp'
  });

  const renderPoints = regl<PointsUniforms, any, PointsProps, any>({
    frag: `
  precision mediump float;

  void main() {
    gl_FragColor = vec4(1, 1, 1, 1);
  }
  `,

    vert: `
  precision mediump float;
  uniform mat4 projection, view;
  uniform float u_pointsize;
  attribute vec3 a_xyz;

  void main() {
    gl_Position = projection * view * vec4(a_xyz, 1);
    gl_PointSize = gl_Position.z > 0.0 ? 0.0 : u_pointsize;
  }
  `,

    depth: {
      enable: true,
    },

    uniforms: {
      u_pointsize: regl.prop<PointsProps, 'u_pointsize'>('u_pointsize'),
    },

    primitive: 'points',
    count: regl.prop<PointsProps, 'count'>('count'),
    attributes: {
      a_xyz: regl.prop<PointsProps, 'a_xyz'>('a_xyz'),
    },

    cull: {
      enable: true,
      face: 'front'
    },
  });


  const renderLines = regl<LinesUniforms, any, LinesProps, any>({
    frag: `
  precision mediump float;
  uniform vec4 u_multiply_rgba, u_add_rgba;
  varying vec4 v_rgba;

  void main() {
    gl_FragColor = v_rgba * u_multiply_rgba + u_add_rgba;
  }
  `,

    vert: `
  precision mediump float;
  uniform mat4 projection, view, scale;
  attribute vec3 a_xyz;
  attribute vec4 a_rgba;
  varying vec4 v_rgba;

  void main() {
    vec4 pos = vec4(a_xyz, 1);
    // v_rgba = (-2.0 * pos.z) * a_rgba;
    v_rgba = a_rgba;
    gl_Position = projection * view * scale * pos;
  }
  `,

    depth: {
      enable: true,
      func: '<'
    },

    uniforms: {
      scale: regl.prop<LinesProps, 'scale'>('scale'),
      u_multiply_rgba: regl.prop<LinesProps, 'u_multiply_rgba'>('u_multiply_rgba'),
      u_add_rgba: regl.prop<LinesProps, 'u_add_rgba'>('u_add_rgba'),
    },

    // blend: {
    //   enable: true,
    //   func: { src: 'one', dst: 'one minus src alpha' },
    //   equation: {
    //     rgb: 'add',
    //     alpha: 'add'
    //   },
    //   color: [0, 0, 0, 0],
    // },
    primitive: 'lines',
    count: regl.prop<LinesProps, 'count'>('count'),
    attributes: {
      a_xyz: regl.prop<LinesProps, 'a_xyz'>('a_xyz'),
      a_rgba: regl.prop<LinesProps, 'a_rgba'>('a_rgba'),
    },
    cull: {
      enable: true,
      face: 'front'
    },
  });

  const renderTriangles = regl<TrianglesUniforms, any, TrianglesProps, any>({
    frag: `
  precision mediump float;
  uniform sampler2D u_colormap;
  varying vec2 v_tm;

  void main() {
    float e = v_tm.x > 0.0
      ? 0.5 * (v_tm.x * v_tm.x + 1.0) // if land
      : 0.5 * (v_tm.x + 1.0); // if water
    gl_FragColor = texture2D(u_colormap, vec2(e, v_tm.y));
  }
  `,

    vert: `
  precision mediump float;
  uniform mat4 projection, view;
  attribute vec3 a_xyz;
  attribute vec2 a_tm;
  varying vec2 v_tm;

  void main() {
    v_tm = a_tm;
    gl_Position = projection * view * vec4(a_xyz, 1);
  }
  `,

    uniforms: {
      u_colormap,
    },

    count: regl.prop<TrianglesProps, 'count'>('count'),
    attributes: {
      a_xyz: regl.prop<TrianglesProps, 'a_xyz'>('a_xyz'),
      a_tm: regl.prop<TrianglesProps, 'a_tm'>('a_tm'),
    },

    cull: {
      enable: true,
      face: 'front'
    },
  });

  const renderCellColor = regl<any, any, CellColorProps, any>({
    frag: `
  precision mediump float;
  uniform sampler2D u_rgba;
  varying vec4 v_rgba;

  void main() {
    gl_FragColor = v_rgba;
  }
  `,

    vert: `
  precision mediump float;
  uniform mat4 projection, view, scale;
  attribute vec3 a_xyz;
  attribute vec4 a_rgba;
  varying vec4 v_rgba;

  void main() {
    v_rgba = a_rgba;
    gl_Position = projection * view * scale * vec4(a_xyz, 1);
  }
  `,
    count: regl.prop<CellColorProps, 'count'>('count'),
    uniforms: {
      scale: regl.prop<CellColorUniforms, 'scale'>('scale'),
    },
    attributes: {
      scale: regl.prop<CellColorProps, 'scale'>('scale'),
      a_rgba: regl.prop<CellColorProps, 'a_rgba'>('a_rgba'),
      a_xyz: regl.prop<CellColorProps, 'a_xyz'>('a_xyz'),
    },

    cull: {
      enable: true,
      face: 'front'
    },
  });

  const renderMinimap = reglMinimap<MinimapUniforms, any, MinimapProps, any>({
    frag: `
  precision mediump float;
  uniform sampler2D u_colormap_minimap;
  varying vec2 v_tm;

  void main() {
    float e = v_tm.x > 0.0
      ? 0.5 * (v_tm.x * v_tm.x + 1.0)
      : 0.5 * (v_tm.x + 1.0);
    gl_FragColor = texture2D(u_colormap_minimap, vec2(e, v_tm.y));
  }
  `,

    vert: `
  precision mediump float;
  attribute vec2 a_xy;
  attribute vec2 a_tm;
  varying vec2 v_tm;
  uniform mat4 vv;

  void main() {
    v_tm = a_tm;
    gl_Position = vec4(a_xy, 0.5, 1) - 0.5;
  }
  `,

    uniforms: {
      u_colormap_minimap
    },

    count: regl.prop<MinimapProps, 'count'>('count'),
    attributes: {
      a_xy: regl.prop<MinimapProps, 'a_xy'>('a_xy'),
      a_tm: regl.prop<MinimapProps, 'a_tm'>('a_tm'),
    },

    cull: {
      enable: true,
      face: 'front'
    },
  });


  const renderIndexedTriangles = regl<IndexedTrianglesUniforms, any, IndexedTrianglesProps, any>({
    frag: `
  #extension GL_OES_standard_derivatives : enable

  precision mediump float;

  uniform sampler2D u_colormap;
  uniform vec2 u_light_angle;
  uniform float u_inverse_texture_size, u_slope, u_flat, u_c, u_d, u_outline_strength;

  varying vec2 v_tm;

  void main() {
    float e = v_tm.x > 0.0? 0.5 * (v_tm.x * v_tm.x + 1.0) : 0.5 * (v_tm.x + 1.0);
    float dedx = dFdx(v_tm.x);
    float dedy = dFdy(v_tm.x);
    vec3 slope_vector = normalize(vec3(dedy, dedx, u_d * 2.0 * u_inverse_texture_size));
    vec3 light_vector = normalize(vec3(u_light_angle, mix(u_slope, u_flat, slope_vector.z)));
    float light = u_c + max(0.0, dot(light_vector, slope_vector));
    float outline = 1.0 + u_outline_strength * max(dedx,dedy);
    gl_FragColor = vec4(texture2D(u_colormap, vec2(e, v_tm.y)).rgb * light / outline, 1);
  }
  `,

    vert: `
  precision mediump float;
  uniform mat4 projection, view;
  attribute vec3 a_xyz;
  attribute vec2 a_tm;
  varying vec2 v_tm;

  void main() {
    v_tm = a_tm;
    gl_Position = projection * view * vec4(a_xyz, 1);
  }
  `,

    uniforms: {
      u_colormap,
      u_light_angle: [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)],
      u_inverse_texture_size: 1.0 / 2048,
      u_d: 60,
      u_c: 0.15,
      u_slope: 6,
      u_flat: 2.5,
      u_outline_strength: 10,
    },

    elements: regl.prop<IndexedTrianglesProps, 'elements'>('elements'),
    attributes: {
      a_xyz: regl.prop<IndexedTrianglesProps, 'a_xyz'>('a_xyz'),
      a_tm: regl.prop<IndexedTrianglesProps, 'a_tm'>('a_tm'),
    },

    cull: {
      enable: true,
      face: 'back'
    },
  });

  function drawPlateVectors(
    mesh: TriangleMesh,
    { r_xyz, r_plate, plate_vec },
    options: IGlobeOptions,
  ) {
    let line_xyz = [], line_rgba = [];

    for (let r = 0; r < mesh.numRegions; r++) {
      line_xyz.push(r_xyz.slice(3 * r, 3 * r + 3));
      line_rgba.push([1, 1, 1, 1]);
      line_xyz.push(
        vec3.add([] as any, r_xyz.slice(3 * r, 3 * r + 3),
        vec3.scale([] as any, plate_vec[r_plate[r]], 2 / Math.sqrt(options.numberCells)))
      );
      line_rgba.push([1, 0, 0, 0]);
    }

    renderLines({
      scale: mat4.fromScaling(mat4.create(), [1.005, 1.005, 1.005]),
      u_multiply_rgba: [1, 1, 1, 1],
      u_add_rgba: [0, 0, 0, 0],
      a_xyz: line_xyz,
      a_rgba: line_rgba,
      count: line_xyz.length,
    });
  }

  const plateCache = new Map();

  function createPlateBoundary(mesh: TriangleMesh, t_xyz, r_plate) {
    const points = [];
    const widths = [];
    for (let s = 0; s < mesh.numSides; s++) {
      let begin_r = mesh.s_begin_r(s),
        end_r = mesh.s_end_r(s);
      if (r_plate[begin_r] !== r_plate[end_r]) {
        let inner_t = mesh.s_inner_t(s),
          outer_t = mesh.s_outer_t(s);
        const x = t_xyz.slice(3 * inner_t, 3 * inner_t + 3);
        const y = t_xyz.slice(3 * outer_t, 3 * outer_t + 3);
        points.push(...x, ...x, ...y, ...y);
        widths.push(0, 3, 3, 0);
      }
    }

    return createLine(regl, {
      color: [1.0, 0.0, 0.0, 1.0],
      widths,
      points,
    });
  }

  function drawPlateBoundaries(
    mesh: TriangleMesh,
    { t_xyz, r_plate },
  ) {
    let line = plateCache.get(mesh);
    if (!line) {
      line = createPlateBoundary(mesh, t_xyz, r_plate);
      plateCache.set(mesh, line);
    }

    line.draw({
      model: mat4.fromScaling(mat4.create(), [1.001, 1.001, 1.001])
    } as any);
  }

  let cellBorderCache = new Map();
  function createCellBorders(mesh, t_xyz) {
    const points = [];
    const line_rgba = [];

    let sides = [];
    for (let r = 0; r < mesh.numRegions * 1; r++) {
      mesh.r_circulate_s(sides, r);
      for (let s of sides) {
        const inner_t = mesh.s_inner_t(s);
        const outer_t = mesh.s_outer_t(s);
        const p1 = t_xyz.slice(3 * inner_t, 3 * inner_t + 3);
        const p2 = t_xyz.slice(3 * outer_t, 3 * outer_t + 3);
        points.push(p2, p1);
        line_rgba.push([0, 0, 0, 0], [0, 0, 0, 0]);
      }
    }
    return { points, line_rgba };
  }

  function drawCellBorders(
    mesh: TriangleMesh,
    { t_xyz },
  ) {
    let data = cellBorderCache.get(mesh);
    if (!data) {
      data = createCellBorders(mesh, t_xyz);
      cellBorderCache.set(mesh, data);
    }

    renderLines({
      scale: mat4.fromScaling(mat4.create(), [1.0001, 1.0001, 1.0001]),
      u_multiply_rgba: [1, 1, 1, 0.5],
      u_add_rgba: [0, 0, 0, 0],
      a_xyz: data.points,
      a_rgba: data.line_rgba,
      count: data.points.length,
    });
  }

  const riversCache = new Map();

  const MIN_RIVER_WIDTH = 1;
  const MAX_RIVER_WIDTH = 5;
  function createRivers(mesh: TriangleMesh, t_xyz, s_flow, zoomLevel: number) {
    let points = [];
    let widths = [];
    for (let s = 0; s < mesh.numSides; s++) {
      if (s_flow[s] > 1) {
        let flow = 0.1 * Math.sqrt(s_flow[s]);
        const inner_t = mesh.s_inner_t(s);
        const outer_t = mesh.s_outer_t(s);
        if (flow > 1) flow = 1;
        const p1 = t_xyz.slice(3 * inner_t, 3 * inner_t + 3);
        const p2 = t_xyz.slice(3 * outer_t, 3 * outer_t + 3);
        points.push(...p1, ...p1, ...p2, ...p2);
        const width = Math.max(MIN_RIVER_WIDTH, flow * MAX_RIVER_WIDTH) * zoomLevel;
        widths.push(0, width, width, 0);
      }
    }

    return createLine(regl, {
      widths,
      points,
    });
  }

  function drawRivers(
    mesh: TriangleMesh,
    { t_xyz, s_flow },
    zoomLevel: number
  ) {
    let line = riversCache.get(mesh);
    if (!line) {
      line = createRivers(mesh, t_xyz, s_flow, zoomLevel);
      riversCache.set(mesh, line);
    }

    line.setStyle({
      miter: 1,
      color: [0.0, 0.0, 1.0, 1.0],
    });

    line.draw({
      model: mat4.fromScaling(mat4.create(), [1.001, 1.001, 1.001])
    } as any);
  }

  function drawCellBorder(mesh: TriangleMesh, { t_xyz }, region: number) {
    let points = [];
    let sides = [];
    mesh.r_circulate_s(sides, region);
    for (const s of sides) {
      const inner_t = mesh.s_inner_t(s);
      const outer_t = mesh.s_outer_t(s);
      const p1 = t_xyz.slice(3 * inner_t, 3 * inner_t + 3);
      const p2 = t_xyz.slice(3 * outer_t, 3 * outer_t + 3);
      points.push(...p1, ...p2);
    }

    const line = createLine(regl, {
      color: [0.0, 0.0, 0.0, 1.0],
      width: 2,
      points,
      miter: 1
    });

    line.draw({
      model: mat4.fromScaling(mat4.create(), [1.0011, 1.0011, 1.0011])
    } as any);
  }

  return {
    regl,
    camera,

    renderPoints,
    renderLines,
    renderTriangles,
    renderCellColor,
    renderIndexedTriangles,
    renderMinimap,

    drawCellBorder,
    drawPlateVectors,
    drawPlateBoundaries,
    drawCellBorders,
    drawRivers,
  };
}

