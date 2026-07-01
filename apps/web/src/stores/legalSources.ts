/**
 * 预置法律/政策数据源配置
 * 基于 docs/数据采集架构_源详细文档.md 中的 10 个源
 */
import type { CollectorSelectors } from '@/stores/reading'

export interface PresetSource {
  id: string
  name: string
  url: string
  category: string
  type: 'json-api' | 'jsonp-api' | 'collector'
  /** 仅 collector 类型需要 */
  selectors?: CollectorSelectors
  description?: string
}

export const LEGAL_SOURCES: PresetSource[] = [
  {
    id: 'gov-policy',
    name: '中国政府网·最新政策',
    url: 'https://www.gov.cn/zhengce/zuixin/',
    category: '政策法规',
    type: 'json-api',
    description: '国务院最新政策，JSON API 直接获取',
  },
  {
    id: 'cctv-law',
    name: '央视网·法治频道',
    url: 'https://news.cctv.com/special/fazhi/',
    category: '法治资讯',
    type: 'jsonp-api',
    description: '央视法治新闻，JSONP API 直接获取',
  },
  {
    id: 'gzlawyer',
    name: '广州律协',
    url: 'https://www.gzlawyer.org/notices',
    category: '律师协会',
    type: 'collector',
    description: '广州律师协会通知公告',
    selectors: {
      item: 'a[href*="info"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: '.date, .time, time',
    },
  },
  {
    id: 'chinacourt-qa',
    name: '中国法院网·法律问答',
    url: 'https://www.chinacourt.cn/article/index/id/MzAwNDAwNTBIApMEAAA.shtml',
    category: '司法案例',
    type: 'collector',
    description: '中国法院网法律问答栏目',
    selectors: {
      item: 'a[href*="/article/"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: '.right, .date, time',
    },
  },
  {
    id: 'chinacourt-case',
    name: '中国法院网·案例点评',
    url: 'https://www.chinacourt.cn/article/index/id/MzAwNDAwNTAwNyACAAA.shtml',
    category: '司法案例',
    type: 'collector',
    description: '中国法院网案例点评栏目',
    selectors: {
      item: 'a[href*="/article/"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: '.right, .date, time',
    },
  },
  {
    id: 'court-judicial',
    name: '最高法·司法文件',
    url: 'https://www.court.gov.cn/fabu/gengduo/17.html',
    category: '司法文件',
    type: 'collector',
    description: '最高人民法院司法文件',
    selectors: {
      item: 'a[href*="court.gov.cn"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: 'span, .date, time',
    },
  },
  {
    id: 'court-interpretation',
    name: '最高法·司法解释',
    url: 'https://www.court.gov.cn/fabu/gengduo/16.html',
    category: '司法文件',
    type: 'collector',
    description: '最高人民法院司法解释',
    selectors: {
      item: 'a[href*="court.gov.cn"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: 'span, .date, time',
    },
  },
  {
    id: 'moj-law',
    name: '司法部·最新发布',
    url: 'http://www.moj.gov.cn/pub/sfbgw/flfggz/flfg/',
    category: '政策法规',
    type: 'collector',
    description: '司法部法律法规',
    selectors: {
      item: 'a[href*="moj.gov.cn"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: 'span, .date, time',
    },
  },
  {
    id: 'samr-law',
    name: '市监局·法规',
    url: 'https://www.samr.gov.cn/flfg/',
    category: '政策法规',
    type: 'collector',
    description: '市场监管总局法规文件',
    selectors: {
      item: 'a[href*="samr.gov.cn"]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: 'span, .date, time',
    },
  },
  {
    id: 'ai-hot',
    name: 'AI热点资讯',
    url: 'https://aihot.virxact.com/',
    category: '科技资讯',
    type: 'collector',
    description: 'AI 热点新闻聚合',
    selectors: {
      item: 'a[href]',
      title: '',
      link: '',
      content: '',
      summary: '',
      author: '',
      date: 'span, .date, time',
    },
  },
]
