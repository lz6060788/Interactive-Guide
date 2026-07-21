export interface HostInfoSheetSection {
  heading: string
  body: string
}

export const HOST_INFO_SHEET_TITLE = '说明'

export const HOST_INFO_SHEET_DEFAULT_SECTIONS: HostInfoSheetSection[] = [
  {
    heading: '资料来源',
    body: '本产业链图谱基于公开研报，以及行业公开资料、网络公开信息整理。节点分类、层级关系、说明文案及部分可视化形式由 AI 辅助归纳、生成和编辑，可能存在遗漏、简化或不准确之处。',
  },
  {
    heading: '免责声明',
    body: '相关内容仅用于产业链结构理解和产品功能展示，不构成投资建议、采购建议、技术选型建议或商业决策依据。如需用于正式研究或决策，请以权威机构、企业公告、原始研报及人工核验结果为准。页面中的场景图、设备图和空间关系为 AI 生成示意图，不代表真实基地、设备比例或企业布局。',
  },
]
