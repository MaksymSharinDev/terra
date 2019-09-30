import colormap from 'colormap';
import { clamp } from 'lodash';
import { Globe } from './worldgen/Globe';
import { EMapMode, biomeColors } from './types';


export interface IMapModeColorMap {
  colors?: Record<string, any>;
  getter: (globe: Globe, r: number) => number,
  color: (
    value: number,
    colors: Record<string, { [index: number]: number[] }>,
    globe: Globe,
    r: number,
  ) => number[];
}

export function createMapModeColor(globe: Globe, definition: IMapModeColorMap) {
  const rgba_array = [];
  for (let s = 0; s < globe.mesh.numSides; s++) {
    const r = globe.mesh.s_begin_r(s);
    const value = definition.getter(globe, r);
    const color = definition.color(value, definition.colors, globe, r);
    rgba_array.push(...color, ...color, ...color);
  }
  return rgba_array;
}

export const mapModeDefs: Map<EMapMode, IMapModeColorMap> = new Map([
  [EMapMode.TECTONICS, {
    getter: (globe, r) => globe.r_elevation[r],
    colors: {
      ocean: colormap({
        colormap: 'velocity-blue',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
      land: colormap({
        colormap: 'velocity-green',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
    },
    color: (value, colors, globe, r) => {
      const index = clamp(Math.round(((value + 1) / 2) * 100), 0, 99);
      const plate_id = globe.r_plate[r];
      const colorMode = globe.plate_is_ocean.has(plate_id) ? 'ocean' : 'land';
      if (colors[colorMode][index]) {
        return colors[colorMode][index];
      }
      return [0, 0, 0, 1];
    }
  }],
  [EMapMode.ELEVATION, {
    getter: (globe, r) => globe.r_elevation[r],
    colors: {
      water: colormap({
        colormap: 'bathymetry',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
      land: colormap({
        colormap: 'chlorophyll',
        nshades: 100,
        format: 'float',
        alpha: 1,
      })
    },
    color: (value, colors) => {
      if (value < 0) {
        const heightFixed = 1 - Math.abs(value);
        const index = clamp(Math.round(heightFixed * 100), 0, 99);
        if (colors.water[index]) {
          return colors.water[index];
        }
      } else {
        const index = clamp(Math.round(value * 100), 0, 99);
        if (colors.land[index]) {
          return colors.land[index];
        }
      }
      return [0, 0, 0, 1];
    },
  }],
  [EMapMode.MOISTURE, {
    getter: (globe, r) => globe.r_moisture[r],
    colors: {
      main: colormap({
        colormap: 'winter',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
    },
    color: (value, colors) => {
      const moistureFixed = (value + 1) / 2;
      const index = clamp(Math.round(moistureFixed * 100), 0, 99);
      if (colors.main[index]) {
        return colors.main[index];
      }
      return [0, 0, 0, 1];
    },
  }],
  [EMapMode.TEMPERATURE, {
    // getter: (globe, r) => globe.insolation[globe.currentMonth][r],
    getter: (globe, r) => globe.r_temperature[r],
    colors: {
      main: colormap({
        colormap: 'rainbow',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
    },
    color: (value, colors) => {
      const index = clamp(Math.round(value * 100), 0, 99);
      if (colors.main[index]) {
        return colors.main[index];
      }
      return [0, 0, 0, 1];
    },
  }],
  [EMapMode.ROUGHNESS, {
    getter: (globe, r) => globe.r_roughness[r],
    colors: {
      main: colormap({
        colormap: 'bluered',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
    },
    color: (value, colors) => {
      const index = clamp(Math.round(value * 100), 0, 99);
      if (colors.main[index]) {
        return colors.main[index];
      }
      return [0, 0, 0, 1];
    },
  }],
  [EMapMode.BIOME, {
    getter: (globe, r) => globe.r_biome[r],
    color: (value) => {
      return biomeColors[value] || [0, 0, 0, 1];
    },
  }],
  [EMapMode.FLOW, {
    colors: {
      main: colormap({
        colormap: 'density',
        nshades: 100,
        format: 'float',
        alpha: 1,
      }),
    },
    getter: (globe, r) => {
      const triangles = globe.mesh.r_circulate_t([], r);
      let r_flow = 0;
      for (const t of triangles) {
        r_flow += globe.t_flow[t];
      }
      r_flow /= triangles.length;
      return r_flow;
    },
    color: (value, colors) => {
      const index = clamp(Math.round(value * 100), 0, 99);
      if (colors.main[index]) {
        return colors.main[index];
      }
      return [0, 0, 0, 1];
    },
  }],
]);