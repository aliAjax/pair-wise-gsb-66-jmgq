<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTrackStore } from '../stores/track'
import { formatTime } from '../utils/time'

const store = useTrackStore()
const keyword = ref('')
const rows = computed(() => store.audit.filter((item) => `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(keyword.value)))
const speedRows = computed(() => store.speedEvents
  .filter((item) => `${item.defectId} ${item.segmentId} ${item.type} ${item.version} ${item.evidenceNo} ${item.requirement} ${item.owner} ${item.operator} ${item.note}`.includes(keyword.value))
  .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)))
function exportReport() {
  const payload = { generatedAt: new Date().toISOString(), segments: store.segments, defects: store.defects, speedEvents: store.speedEvents, projections: store.segments.map((segment) => store.speedForSegment(segment.id)), audit: store.audit }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '轨道几何整治报告.json'; anchor.click(); URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="page audit-page">
    <div class="section-head"><div><h2>整治审计与版本追溯</h2><p>检测数据、派工限速、改派、纠错、复测、恢复命令和晚到补录全部留痕；资料只读保存，判断由领域投影重算。</p></div><v-btn color="primary" @click="exportReport">导出整治报告</v-btn></div>
    <div class="toolbar single"><v-text-field v-model="keyword" density="compact" variant="outlined" hide-details prepend-inner-icon="mdi-magnify" placeholder="搜索实体、动作、依据号、工区或要求" /><span>审计{{ rows.length }}条 / 限速台账{{ speedRows.length }}条</span></div>

    <h3>限速处置台账</h3>
    <v-table density="compact" class="ledger-table">
      <thead><tr><th>采集/接收</th><th>区段</th><th>缺陷</th><th>类型</th><th>版本</th><th>正式/临时</th><th>工区</th><th>要求/原因</th><th>依据</th></tr></thead>
      <tbody>
        <tr v-for="item in speedRows" :key="item.id">
          <td>{{ formatTime(item.collectedAt) }}<small>{{ item.source }} · 接收 {{ formatTime(item.receivedAt) }}</small></td>
          <td>{{ item.segmentId }}</td><td>{{ item.defectId }}</td><td>{{ item.type }}</td><td>V{{ item.version }}</td>
          <td>{{ item.formalSpeed }} / {{ item.temporarySpeed ?? '—' }}</td><td>{{ item.owner }}</td>
          <td>{{ item.requirement }}<small>{{ item.note }}</small></td>
          <td>{{ item.evidenceNo }}<small>{{ item.operator }}</small></td>
        </tr>
      </tbody>
    </v-table>

    <h3>操作审计</h3>
    <v-table density="compact">
      <thead><tr><th>时间</th><th>实体</th><th>动作</th><th>操作人</th><th>说明</th></tr></thead>
      <tbody><tr v-for="item in rows" :key="item.id"><td>{{ formatTime(item.createdAt) }}</td><td>{{ item.entityId }}</td><td>{{ item.action }}</td><td>{{ item.operator }}</td><td>{{ item.detail }}</td></tr></tbody>
    </v-table>
  </section>
</template>

<style scoped>
.audit-page :deep(.v-table) { background: white; border: 1px solid #dae1e2; margin-bottom: 18px; }
.section-head { display: flex; justify-content: space-between; margin-bottom: 14px; }.section-head h2 { margin: 0 0 5px; font-size: 19px; }.section-head p { margin: 0; color: #71807e; font-size: 12px; }
.toolbar.single { display: grid; grid-template-columns: 420px auto; gap: 12px; margin-bottom: 14px; }.toolbar.single span { align-self: center; color: #71807e; font-size: 11px; }
h3 { font-size: 15px; margin: 0 0 8px; }
td small { display: block; color: #7b8786; font-size: 10px; margin-top: 3px; }
</style>
