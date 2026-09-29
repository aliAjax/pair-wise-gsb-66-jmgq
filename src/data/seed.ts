import type { AuditEntry, Defect, GeometryMeasurement, SpeedDisposition, TrackSegment } from '../types'

const measurements = (start: number, values: number[]): GeometryMeasurement[] => values.map((value, index) => ({
  id: `GM-${start + index * 200}`,
  mileage: start + index * 200,
  gauge: value,
  level: +(1.5 + Math.sin(index) * 1.1).toFixed(2),
  alignment: +(0.8 + Math.cos(index / 2) * .8).toFixed(2),
  twist: +(1.0 + Math.sin(index / 3) * .9).toFixed(2),
  measuredAt: `2026-09-${String(25 + Math.floor(index / 6)).padStart(2, '0')}T0${index % 6 + 2}:00:00`,
  detector: index % 2 ? 'GJ-6型轨检车' : '便携式激光测量仪'
}))

export const seedSegments: TrackSegment[] = [
  { id: 'SEG-K102', line: '京广上行 K102', startMileage: 102000, endMileage: 104800, speedLimit: 160, temporarySpeedLimit: 100, version: 4, measurements: measurements(102000, [1433, 1435, 1438, 1443, 1447, 1444, 1437, 1434, 1436, 1439, 1442, 1439, 1435, 1433]) },
  { id: 'SEG-K208', line: '沪昆下行 K208', startMileage: 208000, endMileage: 210600, speedLimit: 200, version: 3, measurements: measurements(208000, [1434, 1433, 1435, 1432, 1431, 1433, 1436, 1438, 1437, 1435, 1434, 1432, 1433, 1434]) }
]

export const seedDefects: Defect[] = [
  {
    id: 'GD-260929-01', segmentId: 'SEG-K102', mileage: 102800, type: '轨距', severity: '一级', measuredValue: 1447, limit: 1446, status: '整治中', owner: '工务一工区', discoveredAt: '2026-09-29T02:10:00', dueDate: '2026-09-29', version: 3,
    actions: [
      { method: '垫板调整', note: '现场先分配至二工区，08:30 改派一工区', operator: '陈伟', recordedAt: '2026-09-29T07:40:00', receivedAt: '2026-09-29T07:45:00', basis: '调度命令 CMD-260929-11' },
      { method: '捣固', note: '完成轨向调整，待复测轨距', operator: '李海', recordedAt: '2026-09-29T09:20:00', receivedAt: '2026-09-29T09:25:00', basis: '作业记录单 WO-01 签字件' }
    ], retests: []
  },
  {
    id: 'GD-260929-02', segmentId: 'SEG-K102', mileage: 103400, type: '高低', severity: '二级', measuredValue: 8.6, limit: 8.0, status: '待复测', owner: '工务一工区', discoveredAt: '2026-09-29T02:20:00', dueDate: '2026-09-30', version: 4,
    actions: [{ method: '打磨', note: '波磨处理完成', operator: '周旭', recordedAt: '2026-09-29T09:10:00' }],
    retests: [{ round: 1, passed: false, measuredValue: 8.4, limit: 8.0, note: '仍高于限值', tester: '王磊', testedAt: '2026-09-29T11:30:00', receivedAt: '2026-09-29T11:30:00', basis: '便携仪 PX-2031 报告 RT-1107' }]
  },
  {
    id: 'GD-260928-07', segmentId: 'SEG-K208', mileage: 209200, type: '三角坑', severity: '三级', measuredValue: 7.5, limit: 8.0, status: '已关闭', owner: '工务二工区', discoveredAt: '2026-09-28T03:00:00', dueDate: '2026-09-29', version: 5,
    actions: [{ method: '垫板调整', note: '调整连续三块垫板', operator: '陈伟', recordedAt: '2026-09-28T08:40:00' }],
    retests: [{ round: 1, passed: true, measuredValue: 6.8, limit: 8.0, note: '满足验收标准', tester: '魏强', testedAt: '2026-09-28T15:20:00' }]
  }
]

export const seedDispositions: SpeedDisposition[] = [
  {
    id: 'SPD-SEED-01', dispatchId: 'DSP-260929-01', originRecordId: undefined, segmentId: 'SEG-K102', defectIds: ['GD-260929-01'],
    type: '派工限速', formalSpeed: 160, temporarySpeed: 100, workAreaRequirement: '24小时内完成捣固调整，设置移动减速信号牌，驻站联络员全程防护',
    owner: '工务二工区', collectedAt: '2026-09-29T04:15:00', receivedAt: '2026-09-29T04:20:00', source: '实时', operator: '调度员 方林', basis: '限速调度命令 CMD-260929-07'
  },
  {
    id: 'SPD-SEED-02', dispatchId: 'DSP-260929-01', originRecordId: 'SPD-SEED-01', segmentId: 'SEG-K102', defectIds: ['GD-260929-01'],
    type: '改派', formalSpeed: 160, temporarySpeed: 100, workAreaRequirement: '沿用原派工要求，完成时限顺延至当日18:00',
    owner: '工务一工区', collectedAt: '2026-09-29T08:30:00', receivedAt: '2026-09-29T08:32:00', source: '实时', operator: '调度员 方林', basis: '改派命令 CMD-260929-11，二工区机具转场'
  },
  {
    id: 'SPD-SEED-03', dispatchId: 'DSP-260929-01', originRecordId: 'SPD-SEED-01', segmentId: 'SEG-K102', defectIds: ['GD-260929-01'],
    type: '派工限速', formalSpeed: 160, temporarySpeed: 80, workAreaRequirement: '现场纸条记录：04:00 已按 80 km/h 拦停降速（后到补录）',
    owner: '工务二工区', collectedAt: '2026-09-29T04:00:00', receivedAt: '2026-09-29T12:40:00', source: '补录', operator: '驻站联络员 赵倩', basis: '纸条限速记录照片 IMG-0929-12，仅留档不覆盖',
    overrideBlocked: '该派工已有生效版本（SPD-SEED-01，采集于 2026-09-29 04:15，临时限速 100 km/h）；后到内容不得覆盖，仅作补录留档，变更请使用“纠错”另存版本。'
  }
]

export const seedAudit: AuditEntry[] = [
  { id: 'A-1', entityId: 'SEG-K102', action: '导入检测数据', operator: 'GJ-6轨检车', detail: '导入K102+000至K104+800共14个采样点', createdAt: '2026-09-29T02:00:00' },
  { id: 'A-2', entityId: 'DSP-260929-01', action: '派工限速', operator: '调度员 方林', detail: 'GD-260929-01 一级缺陷派工：正式160/临时100 km/h，依据 CMD-260929-07', createdAt: '2026-09-29T04:20:00' },
  { id: 'A-3', entityId: 'DSP-260929-01', action: '改派', operator: '调度员 方林', detail: '由工务二工区改派工务一工区，限速维持100 km/h，依据 CMD-260929-11', createdAt: '2026-09-29T08:32:00' },
  { id: 'A-4', entityId: 'DSP-260929-01', action: '后到补录已阻止覆盖', operator: '驻站联络员 赵倩', detail: '04:00纸条80 km/h补录晚到，已生效版本(SPD-SEED-01)不变，仅留档', createdAt: '2026-09-29T12:40:00' },
  { id: 'A-5', entityId: 'GD-260929-02', action: '提交复测', operator: '王磊', detail: '第1轮复测未通过，重新进入整治', createdAt: '2026-09-29T11:30:00' }
]
