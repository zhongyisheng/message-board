// ============================================================
// 留言板 · 第 1 步：让一个最小的后端跑起来
//
// 这个文件不是网页，是一支"开着门等客人"的程序。
// 它在你的电脑上占一个端口（3000），谁来敲这个端口，它就回一句话。
//
// 跟前面四个项目最根本的区别：
//   前面：网页是"文件"，双击就打开了。打开之后它跟你的电脑再无关系。
//   这里：网页是"程序"现场做出来递给你的。程序不跑，网页根本打不开。
//
// 全部逻辑就三件事，来回循环：
//   ① 收到一个请求（req —— 装着"谁来了、想要什么"）
//   ② 决定回什么（res —— 用 writeHead 说状态，用 end 说内容）
//   ③ 回到 ①，继续等下一个人
// ============================================================

const http = require('node:http');

// 端口 = 门牌号。一台电脑上可以有很多程序，靠门牌号区分。
// 这里写成 process.env.PORT || 3000，是为了以后部署到云上时能直接复用
// （云平台会通过 PORT 这个"环境变量"告诉程序该用哪个门牌号）。
const PORT = process.env.PORT || 3000;

// createServer 收到的这个函数，就是"每次有人来敲门时要执行的事"。
// 它会被反复调用 —— 每来一个请求调一次，永不停止。
const server = http.createServer(function (req, res) {
  // req.url    = 对方要的地址，比如 /api/hello
  // req.method = 对方的动作，比如 GET（来取东西）/ POST（来送东西）
  console.log('收到请求：' + req.method + ' ' + req.url);

  // --- 第一个地址：一个真正的"数据接口" ---
  if (req.url === '/api/hello') {
    // ① 先声明状态：200 = 一切正常
    // ② 再声明格式：我要给你的是 JSON
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // ③ 最后把内容送出去。注意：必须是字符串，所以用 JSON.stringify 包一层
    res.end(JSON.stringify({
      message: '后端活着',
      time: new Date().toLocaleString('zh-CN'),
    }));
    return; // 已经回过话了，不要再往下走
  }

  // --- 第二个地址：一个给人看的普通网页（由程序现场生成，不是文件）---
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>留言板后端 · 第 1 步</title></head>' +
      '<body style="font-family:sans-serif;max-width:640px;margin:60px auto;line-height:1.8">' +
      '<h1>留言板后端 · 第 1 步</h1>' +
      '<p>页面你看到了 —— <b>但它不是一个文件</b>，是这支程序刚刚为你拼出来的一段字。</p>' +
      '<p>证据：这段字不在这台电脑的任何一个文件夹里，你在硬盘上搜不到它。</p>' +
      '<p><a href="/api/hello">点这里访问数据接口 /api/hello</a></p>' +
      '<p><a href="/不存在的地址">点这里故意撞一个不存在的地址（看 404）</a></p>' +
      '</body></html>'
    );
    return;
  }

  // --- 其他任何地址：我没有这个东西 → 404 ---
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('没有这个地址：' + req.url);
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('----------------------------------------');
  console.log('后端已启动，正在监听 ' + PORT + ' 端口');
  console.log('在浏览器打开：http://localhost:' + PORT);
  console.log('----------------------------------------');
});
