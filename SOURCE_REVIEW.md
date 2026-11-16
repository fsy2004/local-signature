# 开源源码审读与实现选择

审读日期：2026-11-16。以下两个项目均已完整下载到本地，检查源码与许可证，而非仅依据 README。

## 固定来源

- [szimek/signature_pad](https://github.com/szimek/signature_pad/tree/ec5a9e51a7c72b2d71d93167b627b9ed598e28a0)，提交 `ec5a9e51a7c72b2d71d93167b627b9ed598e28a0`，package.json 版本 5.1.4，MIT。
- [nuoyax/e-sign](https://github.com/nuoyax/e-sign/tree/29557dc797c8160151553f988b3002df1f3b8008)，提交 `29557dc797c8160151553f988b3002df1f3b8008`，MIT。

## 逐项比较

| 源码位置 | 审读发现 | 本工具的选择 |
| --- | --- | --- |
| signature_pad `src/bezier.ts`: fromPoints、calculateControlPoints、length | 用四点构造三次贝塞尔，近似曲线长度用于采样。 | 保留现有中点二次曲线，避免直接替换引擎导致笔迹变化；加入按曲线长度密集圆点采样的绘制方式，使变宽笔迹连续。未复制其控制点实现。 |
| signature_pad `src/signature_pad.ts`: _calculateCurveWidths、_strokeWidth、_drawCurve | 速度指数滤波后计算宽度；以圆点沿曲线填充。Point 记录 pressure，但这些宽度函数不读取 pressure。 | 手写笔保留压力输入，鼠标和手指增加速度平滑的粗细变化；宽度变化再滤波，完整圆点路径一次填充。 |
| signature_pad `src/signature_pad.ts`: _allowPointerId、_handlePointerCancel | 保持同一笔的指针归属，取消时结束笔画。 | 锁定 activeId，其他触点不能合并或结束当前笔；失去捕获和窗口焦点时结束；添加仅手写笔开关。 |
| signature_pad `docs/js/app.js`: resizeCanvas、undoButton、redoButton | 窗口改变后 redraw；按点组撤销恢复，新笔清空 redo。 | 固定 1600×1000 逻辑坐标保存笔画；分辨率变化不改变原始点；恢复与撤销按笔画执行，新笔使 redo 失效。 |
| signature_pad `tests/signature_pad.test.ts`: two-point groups、different pointer IDs | 覆盖短线重放和异指针过滤。 | 增加真实触屏模拟、异指针事件、笔模式及撤销后 PNG 一致性检查。未声称运行上游测试。 |
| e-sign `src/js/app.js`: resizeCanvas、pushHistory、restoreHistory | 使用最多 40 张 ImageData 快照；resize 缩放当前位图，但 restoreHistory 仍 putImageData 旧快照。 | 不采用位图历史，避免内存随整幅分辨率增长及旋转后旧尺寸快照失配风险；保留点数据，完成笔画用单张缓存减轻每帧重绘。此风险来自代码审读，未对上游 UI 做独立复现。 |
| e-sign `src/js/app.js`: continueStroke、endStroke | 中点二次曲线，结束时补到最终采样点。 | 保留短点、短线和末端；重绘与导出使用同一函数，避免重放后外形改变。 |
| e-sign `src/js/app.js`: downloadPNG、copyToClipboard | 独立导出画布，可选择白底；异步 toBlob 后写剪贴板。 | 后续按使用反馈调整为默认白底、可选透明，保留矢量裁边和余白；同步生成 Blob 后立即调用分享/复制，减少丢失用户点击激活的风险。 |
| e-sign `src/index.html` 字体链接、app.js typed signature | 加载 Google Fonts，支持输入文字生成签名。 | 不加载远程字体，不添加字体代签；专注本人手写、单文件离线使用。 |

## 独立补充

- 自动裁边根据笔迹及笔宽取边界，添加 5% 或至少 24 逻辑像素余白，直接按高分辨率重绘，不放大已有位图。
- 极高竖线扩大左右余白，将导出高度限制在 6400 像素以内；极长横线增加上下余白。
- 专注模式不依赖浏览器 Fullscreen API，保持画布宽高比；结束后恢复页面工具。
- 下载链接位于预览 dialog 内，避免模态框使外部下载链接 inert。
- 分享同时处理同步异常、Promise 拒绝和取消；剪贴板不可用时展示图片。
- CSP `connect-src 'none'`，无外部脚本、字体或持久化存储。

## 许可证与复用范围

此版本没有直接拷入两个项目的库、模块或 UI；绘制策略、状态组织和测试案例方向参考上述代码后自行实现。上游均为 MIT：Signature Pad 版权所有 Szymon Nowak (2018)，e-sign 版权所有 halo (2026)。对应 LICENSE 可在上述固定提交链接中查看。若后续直接内嵌库代码，应一并附上完整原始许可。
