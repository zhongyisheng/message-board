/* 留言板 · 第 3 步
 *
 * 第 1 步做的是"读"：去云端把留言取回来。
 * 第 2 步做的是"证明你是谁"：注册 / 登录 / 退出。
 * 这一版做的是"写"：把留言送进云端。
 *
 * 整个流程还是三句话，跟前四个项目同一个套路：
 *   ① 建客户端（告诉它"我是哪个应用"）
 *   ② 向云端要数据 / 让云端替你办一件事
 *   ③ 把结果画到页面上
 */

/* ── ① 建客户端 ──────────────────────────────────────────────
   整个页面只建这一次。登录、数据库、以后的文件上传，全都共用它。
   两个值都来自 cloud-config.js —— 不要在这里写死任何地址。 */
const cloud = WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: window.CLOUD_CONFIG.endpoint,
  publishableKey: window.CLOUD_CONFIG.publishableKey
})

/* ══════════════════════════════════════════════════════════════
   第 2 步：登录（认证）
   ══════════════════════════════════════════════════════════════

   先把四个词分清，代码就都看得懂了：

     认证（Authentication）  你向云端证明"你是你"的过程
     会话（Session）         证明完之后云端发给你的一张通行证
     登录态                  网页当前知不知道你是谁
     onAuthStateChange       不是你问它，是它变了主动通知你

   云端可用的登录方式有三种，都必须经过邮箱验证码：
     邮箱 + 密码 · 邮箱 + 验证码 · 注册（先验证邮箱，再设密码）
   （匿名登录故意不开放 —— "每行数据都要有主人"是它的底线。）
   ══════════════════════════════════════════════════════════════ */

const whoEl = document.getElementById('who')
const openAuthEl = document.getElementById('openAuth')
const signOutEl = document.getElementById('signOut')
const authPanel = document.getElementById('authPanel')
const tabsEl = document.getElementById('tabs')
const authMsgEl = document.getElementById('authMsg')

/* 第 3 步要用的元素，也在这里一次性取出来。
   放在文件顶部是有意为之：renderAccount() 一被调用就要用它们，
   而 renderAccount() 可能在任何时刻被云端通知触发 ——
   先取好，就不用担心"用到的时候它还没准备好"。 */
const cpHintEl = document.getElementById('cp-hint')
const cpName = document.getElementById('cp-name')
const cpText = document.getElementById('cp-text')
const cpSubmit = document.getElementById('cp-submit')
const cpCount = document.getElementById('cp-count')
const cpMsgEl = document.getElementById('cp-msg')

function authMsg(text, kind) {
  authMsgEl.textContent = text
  authMsgEl.className = 'auth-msg' + (kind ? ' ' + kind : '')
}

/* ── 标签页切换 ────────────────────────────────────────────── */
tabsEl.addEventListener('click', function (e) {
  const btn = e.target.closest('.tab')
  if (!btn) return
  showPane(btn.dataset.tab)
})

function showPane(name) {
  // 重置密码没有自己的标签按钮（它是从"忘记密码？"进来的），
  // 所以显示它的时候，让"密码登录"那个标签保持亮着，视觉上不至于"一个都不亮"。
  const tabName = name === 'reset' ? 'password' : name

  tabsEl.querySelectorAll('.tab').forEach(function (b) {
    b.classList.toggle('is-on', b.dataset.tab === tabName)
  })
  // 面板一次只显示一个（重置密码是独立一屏，不跟"密码登录"同时出现）
  document.querySelectorAll('.pane').forEach(function (p) {
    p.hidden = p.dataset.pane !== name
  })
  authMsg('')
}

/* ── 登录态怎么显示 ──────────────────────────────────────────
   一个函数同时管四样：显示谁、两个按钮谁出现、面板收起、发留言区的提示。 */
function renderAccount(session) {
  if (session && session.user) {
    const email = session.user.email || ''
    whoEl.textContent = email || '已登录'
    openAuthEl.hidden = true
    signOutEl.hidden = false
    authPanel.hidden = true
    renderComposeHint(true, email)
  } else {
    whoEl.textContent = '未登录'
    openAuthEl.hidden = false
    signOutEl.hidden = true
    renderComposeHint(false, '')
  }
}

openAuthEl.addEventListener('click', function () {
  authPanel.hidden = !authPanel.hidden
  if (!authPanel.hidden) showPane('password')
})

/* ── 退出 ──────────────────────────────────────────────────── */
signOutEl.addEventListener('click', async function () {
  const { error } = await cloud.auth.signOut()
  if (error) return authMsg('退出失败：' + (error.message || error), 'err')
  authMsg('')
})

/* ──────────────────────────────────────────────────────────────
   ① 邮箱 + 密码登录
   ────────────────────────────────────────────────────────────── */
const pwEmail = document.getElementById('pw-email')
const pwPassword = document.getElementById('pw-password')

document.getElementById('pw-submit').addEventListener('click', async function () {
  const email = pwEmail.value.trim()
  const password = pwPassword.value
  if (!email || !password) return authMsg('邮箱和密码都要填。', 'err')

  authMsg('正在登录…', 'busy')
  const { error } = await cloud.auth.signInWithPassword({ email, password })
  if (error) {
    // 故意不写"这个邮箱没注册过" —— 那等于告诉别人哪些邮箱是这里的用户
    return authMsg('邮箱或密码不对。', 'err')
  }
  authMsg('')
})

document.getElementById('pw-forgot').addEventListener('click', function () {
  showPane('reset')
})

/* ──────────────────────────────────────────────────────────────
   ② 邮箱 + 验证码登录（不用记密码）

   这是一个两步流程，所以需要把第一步的结果暂存下来：
     started = 发送验证码 → 拿到一个"这次验证"的凭据
     started.data.verify({ token })  → 拿验证码把它兑现成登录态
   ────────────────────────────────────────────────────────────── */
let otpStarted = null
const otpStep2 = document.getElementById('otp-step2')

document.getElementById('otp-send').addEventListener('click', async function () {
  const email = document.getElementById('otp-email').value.trim()
  if (!email) return authMsg('先填邮箱。', 'err')

  authMsg('正在发送验证码…', 'busy')
  const started = await cloud.auth.signInWithOtp({ email })
  if (started.error) return authMsg('发送失败：' + (started.error.message || started.error), 'err')

  otpStarted = started
  otpStep2.hidden = false
  authMsg('验证码已发出，去邮箱收（找不到就看垃圾邮件）。', 'ok')
})

document.getElementById('otp-submit').addEventListener('click', async function () {
  if (!otpStarted) return authMsg('请先点「发送验证码」。', 'err')
  const token = document.getElementById('otp-token').value.trim()
  if (!token) return authMsg('填一下收到的验证码。', 'err')

  authMsg('正在校验…', 'busy')
  const completed = await otpStarted.data.verify({ token })
  if (completed.error) return authMsg('验证码不对或已经过期了，重新发一次。', 'err')
  authMsg('')
})

/* ──────────────────────────────────────────────────────────────
   ③ 注册（先验证邮箱，再设密码）

   分两步，也不能合并成一步 —— 云端不允许"没验证邮箱就建账号"。
     sendOtp({ email })        → 发码，同时告诉你这个邮箱是不是已经注册过
     verifyOtp({ ..., password }) → 兑现，顺便把密码带上；注册成功即登录
   ────────────────────────────────────────────────────────────── */
let signupSent = null
const suStep2 = document.getElementById('su-step2')
const suEmail = document.getElementById('su-email')

document.getElementById('su-send').addEventListener('click', async function () {
  const email = suEmail.value.trim()
  if (!email) return authMsg('先填邮箱。', 'err')

  authMsg('正在发送验证码…', 'busy')
  const sent = await cloud.auth.sendOtp({ email })
  if (sent.error) return authMsg('发送失败：' + (sent.error.message || sent.error), 'err')

  signupSent = sent
  suStep2.hidden = false
  authMsg('验证码已发出，去邮箱收（找不到就看垃圾邮件）。', 'ok')
})

document.getElementById('su-submit').addEventListener('click', async function () {
  if (!signupSent) return authMsg('请先点「发送验证码」。', 'err')
  const token = document.getElementById('su-token').value.trim()
  const password = document.getElementById('su-password').value
  if (!token || !password) return authMsg('验证码和密码都要填。', 'err')

  authMsg('正在创建账号…', 'busy')
  const completed = await cloud.auth.verifyOtp({
    verificationId: signupSent.data.verificationId,
    token: token,
    email: suEmail.value.trim(),
    isExistingUser: signupSent.data.isExistingUser,
    // 已经注册过的邮箱不该再走"建账号"，也就不该覆盖人家的旧密码
    password: signupSent.data.isExistingUser ? undefined : password
  })

  if (completed.error) return authMsg('注册失败：' + (completed.error.message || completed.error), 'err')
  if (completed.data && completed.data.isExistingUser) {
    return authMsg('这个邮箱已经注册过了，请用「密码登录」或「验证码登录」。', 'err')
  }
  authMsg('')
})

/* ──────────────────────────────────────────────────────────────
   ④ 重置密码（忘记密码）

   同样是两步。最后一步不是"改密码"，而是 updateUser({ nonce, password }) ——
   成功之后云端会直接把你登进去，所以不用再手动登录一次。
   ────────────────────────────────────────────────────────────── */
let resetStarted = null
const rsStep2 = document.getElementById('rs-step2')
const rsEmail = document.getElementById('rs-email')

document.getElementById('rs-send').addEventListener('click', async function () {
  const email = rsEmail.value.trim()
  if (!email) return authMsg('先填邮箱。', 'err')

  authMsg('正在发送验证码…', 'busy')
  const started = await cloud.auth.resetPasswordForEmail(email)
  if (started.error) return authMsg('发送失败：' + (started.error.message || started.error), 'err')

  resetStarted = started
  rsStep2.hidden = false
  authMsg('验证码已发出，去邮箱收（找不到就看垃圾邮件）。', 'ok')
})

document.getElementById('rs-submit').addEventListener('click', async function () {
  if (!resetStarted) return authMsg('请先点「发送验证码」。', 'err')
  const nonce = document.getElementById('rs-token').value.trim()
  const password = document.getElementById('rs-password').value
  if (!nonce || !password) return authMsg('验证码和新密码都要填。', 'err')

  authMsg('正在重设密码…', 'busy')
  const completed = await resetStarted.data.updateUser({ nonce, password })
  if (completed.error) return authMsg('重设失败：' + (completed.error.message || completed.error), 'err')
  authMsg('')
})

document.getElementById('rs-back').addEventListener('click', function () {
  showPane('password')
})

/* ──────────────────────────────────────────────────────────────
   开门检查：干"和身份有关的事"之前，先问一句"现在登录了吗"

   第 3 步发留言时会用到它。所有涉及"我的数据"的操作都要先过这一关 ——
   不能靠页面上的按钮藏没藏来做安全判断，那层判断改一行代码就绕过去了。
   ────────────────────────────────────────────────────────────── */
async function requireLogin() {
  const { data: session, error } = await cloud.auth.getSession()
  if (error || !session) {
    authPanel.hidden = false
    showPane('password')
    authMsg('这一步需要先登录。', 'err')
    return null
  }
  return session
}

/* ── 启动：先问云端"我现在登录着吗" ──────────────────────────
   刷新页面后还是登录状态，就是因为云端那张通行证存在浏览器里，
   页面一打开 SDK 会自动拿它去核对。 */
async function initAuth() {
  const { data: session, error } = await cloud.auth.getSession()
  if (error) authMsg('读取登录状态失败：' + (error.message || error), 'err')
  renderAccount(session)
}

/* 订阅登录状态的变化。
   和"提问—回答"（getSession）相反，这是"它变了就通知我"。
   登录、退出、通行证过期，都会走到这里。 */
cloud.auth.onAuthStateChange(function (event, session) {
  renderAccount(session)
  console.log('[登录状态变化]', event)
})

/* ══════════════════════════════════════════════════════════════
   第 1 步的部分：从云端读留言
   ══════════════════════════════════════════════════════════════ */

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

/* ── 向云端要数据 ────────────────────────────────────────────
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

/* ── 画到页面上 ──────────────────────────────────────────────
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

/* ══════════════════════════════════════════════════════════════
   第 3 步：发留言（写）
   ══════════════════════════════════════════════════════════════

   写和读只差一个动作：
     读 → .select()
     写 → .insert({...})   后面再链一个 .select() 把新行要回来

   ⚠️ 有一条规矩必须记住：**不许手动传 owner_id**。
      它是服务器看"现在登录的是谁"自己填的（DEFAULT auth.uid()）。
      前端硬传一个值，轻则白传（会被覆盖），重则被数据库直接拒掉 ——
      因为 RLS 那道门写着"只能以自己的身份写"。

   前端能传的只有"内容"和"昵称"。
   昵称只是为了好看，它不参与任何权限判断 —— 真正管权限的是 owner_id。
   ══════════════════════════════════════════════════════════════ */

function cpMsg(text, kind) {
  cpMsgEl.textContent = text
  cpMsgEl.className = 'compose-msg' + (kind ? ' ' + kind : '')
}

/* 昵称框空着时，用邮箱 @ 前面那半截当默认值。
   放 placeholder 而不是直接填进去 —— 默认值看得见，但你没点过它就不算你的输入。 */
function renderComposeHint(loggedIn, email) {
  if (loggedIn) {
    cpHintEl.textContent = '当前身份：' + email + ' —— 发出去的留言会记在你名下。'
    cpName.placeholder = (email.split('@')[0] || '匿名') + '（邮箱前缀，可改）'
  } else {
    cpHintEl.textContent = '还没登录。点「发表」会先让你登录 —— 因为云端不给没有身份的人写数据。'
    cpName.placeholder = '不填就用邮箱前缀'
  }
}

/* 字数计数：跟输入框的 input 事件绑在一起，你打一个字它就走一次 */
function updateCount() {
  cpCount.textContent = cpText.value.length + ' / 500'
}
cpText.addEventListener('input', updateCount)

cpSubmit.addEventListener('click', async function () {
  // ① 开门检查：这一步是"以你的身份"写数据，所以先确认登录。
  //    注意这跟"按钮有没有藏起来"是两回事 —— 藏按钮只是好看，
  //    真正拦人的是这一句 + 数据库那道 RLS 门。
  const session = await requireLogin()
  if (!session) return cpMsg('这一步需要先登录，上面已经帮你把登录框打开了。', 'err')

  const content = cpText.value.trim()
  if (!content) return cpMsg('先写点内容。', 'err')

  const email = (session.user && session.user.email) || ''
  const name = cpName.value.trim() || email.split('@')[0] || '匿名'

  cpSubmit.disabled = true
  cpMsg('正在写入云端…', 'busy')

  // ② 写。只带 content 和 owner_name 两个字段，owner_id 一个字都不传。
  //    链的 .select() 是为了让云端"把刚写进去的那一行回传给我"，
  //    这样我们就知道服务器给它分配了什么编号、什么时间。
  const { data, error } = await cloud.database
    .from('messages')
    .insert({ content: content, owner_name: name })
    .select()

  cpSubmit.disabled = false

  if (error) {
    // 42501 = 权限被拒（没登录，或者想以别人的身份写）
    if (error.code === '42501') {
      return cpMsg('云端拒绝了这次写入：未登录，或者这条数据不归你。', 'err')
    }
    return cpMsg('写入失败：' + (error.message || error), 'err')
  }

  const created = Array.isArray(data) ? data[0] : null
  console.log('[写入成功]', created)

  // ③ 清空输入框，然后重新去云端读一遍列表。
  //    ⭐ 为什么不用"把这一行直接插到列表最前面"（那样看起来更流畅）？
  //    因为"我们以为写成功了"和"云端真的有了"是两件事。
  //    重新读一遍，等于让服务器自己回答"你刚才那条到底在不在"。
  cpText.value = ''
  updateCount()
  cpMsg(
    '已写入' + (created ? '（编号 ' + created.id + '）' : '') +
    '，下面是从云端重新读回来的结果 —— 写进去不算数，读回来才算数。',
    'ok'
  )
  loadMessages()
})

/* ── 启动 ────────────────────────────────────────────────────
   页面一打开先查登录状态，再读一次留言。
   点按钮可以再读一次 —— 用来验证"每次都是真的去云端"。 */
reloadEl.addEventListener('click', loadMessages)
showOrigin()
updateCount()
initAuth()
loadMessages()
