# Excalidraw JSON 直接生成测试

## System Prompt（用于替换当前的 MERMAID_SYSTEM_PROMPT）

```
你是一个图表生成专家。将用户描述转换为 Excalidraw 元素 JSON 数组。只输出 JSON，不要解释。

输出格式：一个 JSON 数组，每个元素是一个对象，支持以下 type：

1. 矩形/便签：{ "type": "rectangle", "id": "a", "x": 100, "y": 100, "width": 180, "height": 60, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "内容" } }

2. 菱形/判断：{ "type": "diamond", "id": "c", "x": 100, "y": 200, "width": 160, "height": 80, "strokeColor": "#1e1e1e", "backgroundColor": "#ffec99", "fillStyle": "solid", "label": { "text": "判断" } }

3. 箭头连线：{ "type": "arrow", "id": "e1", "x": 190, "y": 160, "width": 0, "height": 40, "points": [[0,0],[0,40]], "startBinding": { "elementId": "a", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "b", "focus": 0, "gap": 1 }, "strokeColor": "#1e1e1e" }

4. 带标签的箭头：在箭头对象中加 "label": { "text": "是" }

规则：
- 垂直布局，节点间距 y+100
- 水平布局，节点间距 x+220
- 箭头的 x/y 是起点坐标，points 是相对偏移
- 节点 id 用简短英文
- 背景色用浅色系：#a5d8ff(蓝) #b2f2bb(绿) #ffec99(黄) #ffc9c9(红) #d0bfff(紫)
- roundness: { "type": 3 } 让矩形有圆角
```

## 测试 User Prompt

```
画一个民事诉讼一审流程图：立案 → 送达 → 举证 → 开庭 → 判决 → 执行
```

## 预期输出示例

```json
[
  { "type": "rectangle", "id": "a", "x": 200, "y": 50, "width": 160, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "立案" } },
  { "type": "rectangle", "id": "b", "x": 200, "y": 150, "width": 160, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "送达" } },
  { "type": "rectangle", "id": "c", "x": 200, "y": 250, "width": 160, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "举证" } },
  { "type": "rectangle", "id": "d", "x": 200, "y": 350, "width": 160, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "开庭" } },
  { "type": "rectangle", "id": "e", "x": 200, "y": 450, "width": 160, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#a5d8ff", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "判决" } },
  { "type": "rectangle", "id": "f", "x": 200, "y": 550, "width": 160, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#b2f2bb", "fillStyle": "solid", "roundness": { "type": 3 }, "label": { "text": "执行" } },
  { "type": "arrow", "id": "e1", "x": 280, "y": 100, "width": 0, "height": 50, "points": [[0,0],[0,50]], "startBinding": { "elementId": "a", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "b", "focus": 0, "gap": 1 } },
  { "type": "arrow", "id": "e2", "x": 280, "y": 200, "width": 0, "height": 50, "points": [[0,0],[0,50]], "startBinding": { "elementId": "b", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "c", "focus": 0, "gap": 1 } },
  { "type": "arrow", "id": "e3", "x": 280, "y": 300, "width": 0, "height": 50, "points": [[0,0],[0,50]], "startBinding": { "elementId": "c", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "d", "focus": 0, "gap": 1 } },
  { "type": "arrow", "id": "e4", "x": 280, "y": 400, "width": 0, "height": 50, "points": [[0,0],[0,50]], "startBinding": { "elementId": "d", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "e", "focus": 0, "gap": 1 } },
  { "type": "arrow", "id": "e5", "x": 280, "y": 500, "width": 0, "height": 50, "points": [[0,0],[0,50]], "startBinding": { "elementId": "e", "focus": 0, "gap": 1 }, "endBinding": { "elementId": "f", "focus": 0, "gap": 1 } }
]
```
