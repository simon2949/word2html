import type { LessonScene } from '../types/lessonScene'
import {
  estimateGeometry2DViewport,
  GEOMETRY_2D_TEMPLATE_ID,
  geometryPointBindings,
  validateGeometry2DSpec,
  type Geometry2DSpec,
} from '../core/geometry2d'

export function createGeometry2DScene(
  spec: Geometry2DSpec,
  metadata: { title: string; topic: string; summary: string },
): LessonScene {
  const error = validateGeometry2DSpec(spec)
  if (error) throw new Error(error)
  const parameters: LessonScene['parameters'] = Object.fromEntries(spec.parameters.map((parameter) => [parameter.id, {
    type: 'number' as const, label: parameter.label, description: `调节几何参数 ${parameter.label}`,
    value: parameter.value, default: parameter.value, min: parameter.min, max: parameter.max,
    step: parameter.step, unit: '', editable: true,
  }]))
  return {
    schemaVersion: '0.1', id: `scene.geometry-2d.${Date.now()}`,
    templateRef: { id: GEOMETRY_2D_TEMPLATE_ID, version: 1 },
    metadata: {
      title: metadata.title, subject: 'math', topic: metadata.topic,
      gradeRange: 'K12', locale: 'zh-CN', summary: metadata.summary,
    },
    viewport: estimateGeometry2DViewport(spec), parameters, derivedValues: [],
    objects: [
      { id: 'grid', kind: 'grid', role: '背景网格', bindings: { step: '1' }, visibleWhen: 'showGrid' },
      { id: 'axes', kind: 'axes', role: '坐标轴', bindings: {}, visibleWhen: 'showAxes' },
      ...spec.polygons.map((polygon) => ({
        id: `polygon.${polygon.id}`, kind: 'polygon' as const, role: '几何多边形', label: polygon.label,
        bindings: { pointIds: polygon.pointIds.join(','), filled: polygon.filled ? '1' : '0' },
      })),
      ...spec.arcs.map((arc) => ({
        id: `arc.${arc.id}`, kind: 'arc' as const, role: '几何圆弧', label: arc.label,
        bindings: {
          centerPointId: arc.centerPointId, startPointId: arc.startPointId,
          endPointId: arc.endPointId, clockwise: arc.clockwise ? '1' : '0',
        },
      })),
      ...spec.connections.map((connection) => ({
        id: `connection.${connection.id}`, kind: connection.kind, role: '几何连线', label: connection.label,
        bindings: { fromPointId: connection.fromPointId, toPointId: connection.toPointId },
      })),
      ...spec.points.map((point) => ({
        id: `point.${point.id}`, kind: 'point' as const, role: '几何点', label: point.label,
        bindings: geometryPointBindings(point),
        ...(point.draggable !== undefined ? { interactive: point.draggable } : {}),
      })),
      ...(spec.loci ?? []).map((locus) => ({
        id: `locus.${locus.id}`, kind: 'locus' as const, role: '几何轨迹', label: locus.label,
        bindings: {
          pointId: locus.pointId, parameterId: locus.parameterId,
          ...(locus.min !== undefined ? { min: String(locus.min) } : {}),
          ...(locus.max !== undefined ? { max: String(locus.max) } : {}),
        }, visibleWhen: 'showTrail' as const,
      })),
      ...spec.measurements.map((measurement) => ({
        id: `measurement.${measurement.id}`, kind: 'label' as const, role: '几何测量', label: measurement.label,
        ...(measurement.unit ? { unit: measurement.unit } : {}),
        bindings: {
          measurementKind: measurement.kind, pointIds: measurement.pointIds.join(','),
          ...(measurement.expression ? { expression: measurement.expression } : {}),
        }, visibleWhen: 'showHelperLines' as const,
      })),
    ],
    controls: [
      ...spec.parameters.map((parameter) => ({ id: `control.${parameter.id}`, label: parameter.label, type: 'slider' as const, target: parameter.id })),
      { id: 'reset', label: '恢复默认', type: 'button', target: spec.points[0] ? `point.${spec.points[0].id}` : 'axes' },
    ],
    interactions: [
      ...spec.points.filter((point) => point.draggable).map((point) => ({
        id: `drag.${point.id}`, trigger: 'drag' as const, target: `point.${point.id}`, action: 'set-point' as const,
      })),
      { id: 'resetGeometry', trigger: 'reset', target: spec.points[0] ? `point.${spec.points[0].id}` : 'axes', action: 'reset' },
    ],
    annotations: { formula: spec.formula, conclusion: spec.conclusion },
    invariants: [{
      id: 'finiteGeometry', label: '全部几何坐标和测量值有限', expression: '0',
      expectedExpression: '0', tolerance: 1e-10, severity: 'error',
    }],
    appearance: {
      theme: 'light', showAxes: true, showGrid: true, showFocusLabels: false,
      showPointLabel: true, showHelperLines: true, showIndividualDistances: false,
      showDistanceSum: false, showFormula: true, showTrail: (spec.loci?.length ?? 0) > 0,
      curveColor: '#5B5BD6', focusColor: '#E15C48', pointColor: '#087E8B', helperColor: '#F3A712',
      lineWidth: 3, pointRadius: 7, lineStyle: 'solid', helperLineStyle: 'dashed',
      helperLineWidth: 2, pointStyle: 'outlined', fontScale: 1, animationSpeed: 0.55,
    },
    lineage: {
      source: 'model', matchLevel: 'new',
      fingerprint: `geometry-2d|${spec.points.map((point) => point.construction?.kind ?? 'coordinate').join(',')}|${spec.connections.map((connection) => connection.kind).join(',')}|loci:${spec.loci?.length ?? 0}|v2`.slice(0, 200),
      updatedAt: new Date().toISOString(),
    },
  }
}
