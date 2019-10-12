import { ReactiveWorkerClient } from '../utils/workers';
import WorldgenWorker from 'worker-loader!./Worldgen.worker';
import { IGlobeOptions, EMapMode } from 'src/types';
import { GlobeData, CellPoints, CellGlobeData, WorldData, ICellGroupTooltipData, CellWorldData } from '../types';


export class WorldgenClient {
  worker$: ReactiveWorkerClient;

  constructor() {
    this.worker$ = new ReactiveWorkerClient(new WorldgenWorker(), false);
  }

  newWorld(options: IGlobeOptions, mapMode: EMapMode): Promise<WorldData> {
    console.time('worldgen worker');
    return new Promise((resolve) => {
      this.worker$.action('init').send({ options, mapMode });

      this.worker$.on('generate').subscribe(result => {
        console.log('[worldgen client] result', result);

        console.timeEnd('worldgen worker');
        resolve(result);
      });
    });
  }

  // time
  start() {
    this.worker$.action('start').send();
  }
  stop() {
    this.worker$.action('stop').send();
  }
  faster() {
    this.worker$.action('faster').send();
  }
  slower() {
    this.worker$.action('slower').send();
  }

  async getIntersectedCell(point: number[], dir: number[]): Promise<CellPoints | null> {
    return new Promise((resolve) => {
      this.worker$.action('getIntersectedCell')
        .observe({ point, dir })
        .subscribe(result => resolve(result as CellPoints));
    });
  }

  async getCellGroupForCell(cell: number): Promise<ICellGroupTooltipData | null> {
    return this.worker$.action('getCellGroupForCell')
        .observe(cell)
        .toPromise() as Promise<ICellGroupTooltipData>;
  }

  async getCellData(r: number): Promise<CellWorldData> {
    return this.worker$.action('getCellData')
      .observe(r)
      .toPromise() as Promise<CellWorldData>;
  }

  async setMapMode(mapMode: EMapMode) {
    return new Promise((resolve) => {
      this.worker$.action('setMapMode')
        .observe(mapMode)
        .subscribe(() => resolve());
    })
  }
}