import type { AuditEntry, Defect, GeometryMeasurement, SpeedEvent, TrackSegment } from '../types'

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
  { id: 'SEG-K102', line: '京广上行 K102', startMileage: 102000, endMileage: 104800, speedLimit: 160, version: 4, measurements: measurements(102000, [1433, 1435, 1438, 1443, 1447, 1448, 1444, 1434, 1436, 1439, 1442, 1439, 1435, 1433]) },
  { id: 'SEG-K208', line: '沪昆下行 K208', startMileage: 208000, endMileage: 210600, speedLimit: 200, version: 3, measurements: measurements(208000, [1434, 1433, 1435, 1432, 1431, 1433, 1436, 1438, 1437, 1435, 1434, 1432, 1433, 1434]) }
]

export const seedDefects: Defect[] = [
  {
    id: 'GD-260929-01', segmentId: 'SEG-K102', mileage: 102800, type: '轨距', severity: '一级', measuredValue: 1447, limit: 1446, status: '整治中', owner: '工务一工区', requirement: '封锁点内调整轨距，列车按100km/h通过', discoveredAt: '2026-09-29T02:10:00', dueDate: '2026-09-29', version: 4,
    actions: [{ method: '捣固', note: '完成轨向调整，待复测轨距', operator: '李海', recordedAt: '2026-09-29T07:20:00', source: '实时采集', evidenceNo: 'XC-0929-01', receivedAt: '2026-09-29T07:20:00' }],
    retests: []
  },
  {
    id: 'GD-260929-03', segmentId: 'SEG-K102', mileage: 103600, type: '高低', severity: '一级', measuredValue: 9.4, limit: 8.0, status: '整治中', owner: '工务二工区', requirement: '连续捣固并复查扣件，限速80km/h', discoveredAt: '2026-09-29T02:26:00', dueDate: '2026-09-29', version: 2,
    actions: [{ method: '垫板调整', note: '已垫入3mm垫板，捣固未完成', operator: '赵鹏', recordedAt: '2026-09-29T08:05:00', source: '实时采集', evidenceNo: 'XC-0929-03', receivedAt: '2026-09-29T08:05:00' }],
    retests: []
  },
  {
    id: 'GD-260929-02', segmentId: 'SEG-K102', mileage: 103400, type: '高低', severity: '二级', measuredValue: 8.6, limit: 8.0, status: '待复测', owner: '工务一工区', requirement: '24小时内完成波磨打磨', discoveredAt: '2026-09-29T02:20:00', dueDate: '2026-09-30', version: 4,
    actions: [{ method: '打磨', note: '波磨处理完成', operator: '周旭', recordedAt: '2026-09-29T09:10:00', source: '实时采集', evidenceNo: 'XC-0929-02', receivedAt: '2026-09-29T09:10:00' }],
    retests: [{ round: 1, passed: false, measuredValue: 8.4, limit: 8.0, note: '仍高于限值', tester: '王磊', testedAt: '2026-09-29T11:30:00', source: '实时采集', evidenceNo: 'FC-0929-02-R1', receivedAt: '2026-09-29T11:30:00' }]
  },
  {
    id: 'GD-260928-07', segmentId: 'SEG-K208', mileage: 209200, type: '三角坑', severity: '一级', measuredValue: 7.5, limit: 8.0, status: '已关闭', owner: '工务二工区', requirement: '调整垫板并复测三角坑', discoveredAt: '2026-09-28T03:00:00', dueDate: '2026-09-28', version: 5,
    actions: [{ method: '垫板调整', note: '调整连续三块垫板', operator: '陈伟', recordedAt: '2026-09-28T08:40:00', source: '实时采集', evidenceNo: 'XC-0928-07', receivedAt: '2026-09-28T08:40:00' }],
    retests: [{ round: 1, passed: true, measuredValue: 6.8, limit: 8.0, note: '满足验收标准', tester: '魏强', testedAt: '2026-09-28T15:20:00', source: '实时采集', evidenceNo: 'FC-0928-07-R1', receivedAt: '2026-09-28T15:20:00' }]
  }
]

export const seedSpeedEvents: SpeedEvent[] = [
  {
    id: 'SE-01', defectId: 'GD-260929-01', segmentId: 'SEG-K102', type: '派工', version: 1, formalSpeed: 160, temporarySpeed: 120,
    requirement: '封锁点内调整轨距', owner: '工务一工区', operator: '调度员 方林', source: '实时采集', evidenceNo: 'PG-0929-01',
    note: '一级缺陷派工时登记正式限速、临时限速和工区要求', collectedAt: '2026-09-29T04:20:00', receivedAt: '2026-09-29T04:25:00'
  },
  {
    id: 'SE-02', defectId: 'GD-260929-01', segmentId: 'SEG-K102', type: '纠错', version: 2, formalSpeed: 160, temporarySpeed: 100,
    requirement: '封锁点内调整轨距，列车按100km/h通过', owner: '工务一工区', operator: '安全科 何敏', source: '实时采集', evidenceNo: 'JC-0929-01-V2',
    note: '现场复核后确认临时限速应为100km/h，原V1仍保留可查', collectedAt: '2026-09-29T08:30:00', receivedAt: '2026-09-29T08:35:00'
  },
  {
    id: 'SE-03', defectId: 'GD-260929-03', segmentId: 'SEG-K102', type: '派工', version: 1, formalSpeed: 160, temporarySpeed: 80,
    requirement: '连续捣固并复查扣件，限速80km/h', owner: '工务二工区', operator: '调度员 方林', source: '实时采集', evidenceNo: 'PG-0929-03',
    note: '与K102另一处一级缺陷并存，区段按更严格的80km/h执行', collectedAt: '2026-09-29T05:05:00', receivedAt: '2026-09-29T05:08:00'
  },
  {
    id: 'SE-04', defectId: 'GD-260928-07', segmentId: 'SEG-K208', type: '派工', version: 1, formalSpeed: 200, temporarySpeed: 120,
    requirement: '调整垫板并复测三角坑', owner: '工务二工区', operator: '调度员 许舟', source: '实时采集', evidenceNo: 'PG-0928-07',
    note: '一级缺陷派工时设置临时限速', collectedAt: '2026-09-28T06:10:00', receivedAt: '2026-09-28T06:15:00'
  },
  {
    id: 'SE-05', defectId: 'GD-260928-07', segmentId: 'SEG-K208', type: '恢复', version: 2, formalSpeed: 200,
    requirement: '恢复至整治前速度200km/h', owner: '工务二工区', operator: '调度员 许舟', source: '实时采集', evidenceNo: 'HF-0928-07',
    note: '复测合格且同区段最后一个未关闭一级缺陷关闭，按恢复命令恢复', collectedAt: '2026-09-28T15:30:00', receivedAt: '2026-09-28T15:30:00', retestRound: 1
  }
]

export const seedAudit: AuditEntry[] = [
  { id: 'A-1', entityId: 'SEG-K102', action: '导入检测数据', operator: 'GJ-6轨检车', detail: '导入K102+000至K104+800共14个采样点', createdAt: '2026-09-29T02:00:00' },
  { id: 'A-2', entityId: 'GD-260929-01', action: '派工限速登记', operator: '调度员 方林', detail: '正式限速160km/h，临时限速120km/h，工区要求已记录', createdAt: '2026-09-29T04:25:00' },
  { id: 'A-3', entityId: 'GD-260929-01', action: '限速纠错', operator: '安全科 何敏', detail: '另存V2：临时限速100km/h，V1原始速度保留', createdAt: '2026-09-29T08:35:00' },
  { id: 'A-4', entityId: 'GD-260929-02', action: '提交复测', operator: '王磊', detail: '第1轮复测未通过，重新进入整治', createdAt: '2026-09-29T11:30:00' },
  { id: 'A-5', entityId: 'GD-260928-07', action: '自动恢复限速', operator: '系统', detail: '最后一个一级缺陷复测关闭，恢复整治前速度200km/h', createdAt: '2026-09-28T15:30:00' }
]
