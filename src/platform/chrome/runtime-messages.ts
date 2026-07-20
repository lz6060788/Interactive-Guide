export interface RuntimeMessages {
  back: string
  share: string
  information: string
  sheetTitle: string
  sourceHeading: string
  sourceBody: string
  disclaimerHeading: string
  disclaimerBody: string
  relatedContent: string
  openAtlas: string
  atlasUrlMissing: string
  runtimeFailure: string
}

const MESSAGES: Record<string, RuntimeMessages> = {
  'zh-CN': {
    back: '返回',
    share: '分享',
    information: '提示信息',
    sheetTitle: '说明',
    sourceHeading: '资料来源',
    sourceBody:
      '本产业链图谱基于公开研报，以及行业公开资料、网络公开信息整理，可能存在遗漏、简化或不准确之处。',
    disclaimerHeading: '免责声明',
    disclaimerBody:
      '相关内容仅用于产业链结构理解和产品功能展示，不构成投资建议、采购建议、技术选型建议或商业决策依据。如需用于正式研究或决策，请以权威机构、企业公告、原始研报及人工核验结果为准。',
    relatedContent: '相关内容',
    openAtlas: '打开全景图',
    atlasUrlMissing: '请先配置 Atlas 完整地址',
    runtimeFailure: '页面启动失败：',
  },
  'en-US': {
    back: 'Back',
    share: 'Share',
    information: 'Information',
    sheetTitle: 'About',
    sourceHeading: 'Sources',
    sourceBody:
      'This industry-chain guide is compiled from public research reports, industry materials, and publicly available online information. It may contain omissions, simplifications, or inaccuracies.',
    disclaimerHeading: 'Disclaimer',
    disclaimerBody:
      'This content is provided only to explain industry-chain structures and demonstrate product features. It does not constitute investment, procurement, technology-selection, or business advice. Use authoritative sources and manual verification for formal research or decisions.',
    relatedContent: 'Related content',
    openAtlas: 'Open panorama',
    atlasUrlMissing: 'Configure the full Atlas URL first',
    runtimeFailure: 'Runtime failed to start:',
  },
}

export function runtimeMessages(locale: string): RuntimeMessages {
  return MESSAGES[locale] ?? MESSAGES['zh-CN']
}
