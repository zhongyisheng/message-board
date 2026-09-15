/* 留言板 · 第 1 步
 *
 * 这一版只做一件事：把云端的留言读出来显示。
 * 还不会写、不会登录、不会删 —— 那些是后面的步骤。
 *
 * 整个流程只有三句话，跟前四个项目是同一个套路：
 *   ① 建客户端（告诉它"我是哪个应用"）
 *   ② 向云端要数据
 *   ③ 把拿到的数据画到页面上
 *
 * 区别在于第 ② 步：以前是从 localStorage 拿（就在你这台电脑里），
 * 现在是从云端拿（要过网络、要过对方的检查）。
 */

/* ── ① 建客户端 ──────────────────────────────────────────────
   整个页面只建这一次。以后加的登录、文件上传等功能，全都共用它。
   两个值都来自 cloud-config.js —— 不要在这里写死任何地址。 */
const cloud = WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: window.CLOUD_CONFIG.endpoint,
  publishableKey: window.CLOUD_CONFIG.publishableKey
})

/* ── 页面上的几个零件 ──────────────────────────────────────── */
const listEl = document.getElementById('list')
const statusEl = document.getElementById('status')
const reloadEl = document.getElementById('reload')
const originEl = document.getElementById('origin')

let readCount = 0   // 读过几次。用它可以证明"每次都是真的去云端取，不是本地缓存的"

/* ── 页面地址提示 ────────────────────────────────────────────
   云服务有一道额外的门：它只认自己那个域名的网页。
   所以从本地双击打开、或者从别的网址打开，接口会拒绝。
   这里直接把"当前地址"和"要求的地址"显示出来，省得卡住了不知道从哪查。 */
function showOrigin() {
  const now = location.origin === 'null' ? 'file://（本地文件）' : location.origin
  const need = window.CLOUD_CONFIG.endpoint

  if (location.origin === need) {
    originEl.textContent = '页面地址：' + now + ' ✅'
    originEl.classList.remove('warn')
  } else {
    originEl.textContent =
      '页面地址：' + now + ' ｜ ⚠️ 云端接口只认 ' + need +
      ' —— 从这个地址打开，下面大概率读不到数据。请改用公网地址。'
    originEl.classList.add('warn')
  }
}

/* ── ② 向云端要数据 ──────────────────────────────────────────
   from('messages')   —— 要哪张表
   .select(...)       —— 要哪几列
   .order(...)        —— 按时间倒序，新的在最前
   .limit(50)         —— 最多 50 条
   结果永远是 { data, error } 这个形状，两个都要看，不能只看 data。 */
async function loadMessages() {
  reloadEl.disabled = true
  setStatus('正在从云端读取…', 'busy')
  const t0 = Date.now()

  const { data, error } = await cloud.database
    .from('messages')
    .select('id, owner_name, content, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    // 读失败也要说人话。"读不到"和"一条都没有"是两件完全不同的事。
    setStatus('读取失败：' + (error.message || error), 'err')
    render([])
    reloadEl.disabled = false
    return
  }

  readCount = readCount + 1
  render(data)
  setStatus(
    '第 ' + readCount + ' 次读取：拿到 ' + data.length + ' 条，耗时 ' + (Date.now() - t0) + ' 毫秒',
    'ok'
  )
  reloadEl.disabled = false
}

/* ── ③ 画到页面上 ────────────────────────────────────────────
   注意这里全程用 textContent 而不是 innerHTML。
   因为留言是"别人写的内容"，用 innerHTML 会把别人写的标签当代码执行 ——
   这是最常见的网页漏洞之一（XSS）。textContent 只当纯文本，安全。 */
function render(rows) {
  listEl.innerHTML = ''

  if (!rows || rows.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = '云端一条留言都没有。'
    listEl.appendChild(li)
    return
  }

  rows.forEach(function (row) {
    const li = document.createElement('li')
    li.className = 'msg'

    const head = document.createElement('div')
    head.className = 'msg-head'

    const name = document.createElement('span')
    name.className = 'msg-name'
    name.textContent = row.owner_name || '匿名'

    const time = document.createElement('time')
    time.className = 'msg-time'
    time.textContent = formatTime(row.created_at)

    head.appendChild(name)
    head.appendChild(time)

    const body = document.createElement('p')
    body.className = 'msg-body'
    body.textContent = row.content

    li.appendChild(head)
    li.appendChild(body)
    listEl.appendChild(li)
  })
}

/* 云端给的时间是 ISO 格式（2026-09-16T03:27:13.453772+08:00），太长，改成 09-16 03:27 */
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  const p = function (n) { return String(n).padStart(2, '0') }
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

function setStatus(text, kind) {
  statusEl.textContent = text
  statusEl.className = 'status' + (kind ? ' ' + kind : '')
}

/* ── 启动 ────────────────────────────────────────────────────
   页面一打开就先读一次。点按钮可以再读一次 —— 用来验证"每次都是真的去云端"。 */
reloadEl.addEventListener('click', loadMessages)
showOrigin()
loadMessages()
