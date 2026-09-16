/* 留言板 · 第 4 步
 *
 * 第 1 步做的是"读"：去云端把留言取回来。
 * 第 2 步做的是"证明你是谁"：注册 / 登录 / 退出。
 * 第 3 步做的是"写"：把留言送进云端。
 * 这一版做的是"删"—— 而重点不在删，在"权限"。
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
  // 这一步也要兜住错误：万一"查登录状态"本身失败（比如凭据过期、网络不通），
  // 它会抛错。抛出去没人接，页面就什么都不显示 —— 那是查不出来的 bug。
  let session = null
  try {
    const res = await cloud.auth.getSession()
    if (res && res.error) {
      authPanel.hidden = false
      showPane('password')
      authMsg('读取登录状态失败：' + (res.error.message || res.error) + '，请重新登录一次。', 'err')
      return null
    }
    session = res && res.data
  } catch (e) {
    console.error('[开门检查] 查登录状态时抛错：', e)
    authPanel.hidden = false
    showPane('password')
    authMsg('读取登录状态失败（' + ((e && e.message) || e) + '），请重新登录一次。', 'err')
    return null
  }

  if (!session) {
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
   这是最常见的网页漏洞之一（XSS）。textContent 只当纯文本，安全。

   第 4 步新增：每条留言下面加一个「删除」按钮。
   ⚠️ 故意**不做**"这条是不是我的"这种前端判断 —— 两个原因：
     ① 前端判断是假的：改一行代码就绕过去，它拦不住任何人；
     ② 数据库那道门（RLS）才是真的：不归你的行，它一行都不动。
   所以按钮谁都能点，能不能删掉由云端说了算。这一版就是让你亲眼看见这件事。 */
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
    li.dataset.id = row.id

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

    // 删除按钮 + 它自己的"上膛"状态（先点一次变「真的删？」，再点才真的删）
    const actions = document.createElement('div')
    actions.className = 'msg-actions'

    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'danger'
    del.textContent = '删除'
    del.addEventListener('click', function () {
      if (del.dataset.armed !== '1') {
        del.dataset.armed = '1'
        del.textContent = '真的删？'
        del.classList.add('is-armed')
        // 4 秒不动手就自动收回去，免得你以为它还是个普通按钮
        clearTimeout(del._disarm)
        del._disarm = setTimeout(disarm, 4000)
        setStatus('再点一次「真的删？」就把编号 ' + row.id + ' 这条删掉（4 秒后自动取消）。', 'busy')
        return
      }
      disarm()
      deleteMessage(row.id, del)
    })
    function disarm() {
      clearTimeout(del._disarm)
      delete del.dataset.armed
      del.textContent = '删除'
      del.classList.remove('is-armed')
      del.disabled = false
    }

    actions.appendChild(del)

    li.appendChild(head)
    li.appendChild(body)
    li.appendChild(actions)
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

/* ── 等一个"最多等多久"的壳子 ────────────────────────────────
   请求发出去之后如果一直没人回，页面就会永远停在"正在写入…"，
   既不算成功也不算失败 —— 这是最难查的一种状态（静默卡死）。
   所以给每个请求配一个闹钟：超过 15 秒还没回，就当作失败报出来。 */
function withTimeout(promiseLike, ms) {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error('等了 ' + (ms / 1000) + ' 秒服务器还没回应（可能是网络被挡、或者地址不够新）'))
    }, ms)
    Promise.resolve(promiseLike).then(
      function (v) { clearTimeout(timer); resolve(v) },
      function (e) { clearTimeout(timer); reject(e) }
    )
  })
}

cpSubmit.addEventListener('click', async function () {
  cpSubmit.disabled = true

  // 整个流程套在 try/catch 里。
  // 为什么？——因为"代码自己抛错"和"服务器返回错误"是两件完全不同的事，
  // 前者如果没人接住，页面上会一点动静都没有（就是静默失败）。
  // 有了 catch，无论哪种出错，你都至少能在页面上看到一句话。
  try {
    // ① 开门检查：这一步是"以你的身份"写数据，所以先确认登录。
    //    注意这跟"按钮有没有藏起来"是两回事 —— 藏按钮只是好看，
    //    真正拦人的是这一句 + 数据库那道 RLS 门。
    cpMsg('① 正在确认登录状态…', 'busy')
    const session = await withTimeout(requireLogin(), 15000)
    if (!session) return cpMsg('这一步需要先登录，上面已经帮你把登录框打开了。', 'err')
    console.log('[第3步-①] 已登录：', session.user && session.user.email)

    const content = cpText.value.trim()
    if (!content) return cpMsg('先写点内容。', 'err')

    const email = (session.user && session.user.email) || ''
    const name = cpName.value.trim() || email.split('@')[0] || '匿名'

    // ② 写。只带 content 和 owner_name 两个字段，owner_id 一个字都不传。
    cpMsg('② 正在写入云端…（最多等 15 秒）', 'busy')
    console.log('[第3步-②] 发出写入请求：', { content: content, owner_name: name, 带没带owner_id: false })

    let query = cloud.database
      .from('messages')
      .insert({ content: content, owner_name: name })

    // 先问一句"它有没有这个功能"再用。
    // 链 .select() 是为了让云端把刚写进去的那一行回传给我 ——
    // 但万一这个版本的接口不支持链它，直接链会让整个流程当场断掉（而且悄无声息）。
    // 问一句再走，就不会因为这种版本差异把功能打死。
    if (query && typeof query.select === 'function') {
      query = query.select()
    } else {
      console.warn('[第3步-②] 这个版本的 insert 后面链不了 .select()，改成不取回写好的那一行')
    }

    const res = await withTimeout(query, 15000)
    const data = res && res.data
    const error = res && res.error
    console.log('[第3步-②] 云端回应：', res)

    if (error) {
      // 42501 = 权限被拒（没登录，或者想以别人的身份写）
      if (error.code === '42501') {
        return cpMsg('云端拒绝了这次写入：未登录，或者这条数据不归你。', 'err')
      }
      return cpMsg('写入失败：' + (error.message || error), 'err')
    }

    const created = Array.isArray(data) ? data[0] : (data && data.id ? data : null)
    console.log('[写入成功]', created)

    // ③ 清空输入框，然后重新去云端读一遍列表。
    //    ⭐ 为什么不用"把这一行直接插到列表最前面"（那样看起来更流畅）？
    //    因为"我们以为写成功了"和"云端真的有了"是两件事。
    //    重新读一遍，等于让服务器自己回答"你刚才那条到底在不在"。
    cpText.value = ''
    updateCount()
    cpMsg('③ 已写入' + (created ? '（编号 ' + created.id + '）' : '') + '，正在重新读一遍列表…', 'ok')
    await loadMessages()
    cpMsg(
      '③ 已写入' + (created ? '（编号 ' + created.id + '）' : '') +
      '，列表就是刚从云端读回来的结果 —— 写进去不算数，读回来才算数。',
      'ok'
    )
  } catch (e) {
    // 走到这里 = 代码自己出错了（不是服务器返回的错误）。一定要让它可见。
    console.error('[第3步] 出错了：', e)
    cpMsg('出错：' + ((e && (e.message || e)) || '未知错误') + '（细节已打到 Console）', 'err')
  } finally {
    // 无论成功、失败、还是抛错，按钮最后一定要恢复可点，
    // 否则你会遇到"点了一次之后再点就没反应"—— 因为按钮一直是灰的。
    cpSubmit.disabled = false
  }
})

/* ══════════════════════════════════════════════════════════════
   第 4 步：删留言 —— 重点是"权限"，不是"删除"
   ══════════════════════════════════════════════════════════════

   写法上只多了一个链：
     读 → .select()
     写 → .insert({...}).select()
     删 → .delete().eq('id', 编号).select()

   ⭐ 这一版最值钱的一句话：
      **空数组 = 被拦住了，不是成功了。**

      删别人的留言时，云端不会报错，也不会提示"你没权限"，
      它就返回一个空数组 —— 因为 RLS 会把"你不该碰的行"直接过滤掉。
      你要是只检查"有没有 error"，就会以为删成功了。
      所以判据必须是：**看删掉了几条**。

   ⚠️ 还有必须遵守的一条：永远不要写"没有 .eq() 的删除"。
      那等于"把这张表清空"。这不是比喻，是真的一条 SQL 就把所有人的留言删光。
   ══════════════════════════════════════════════════════════════ */

async function deleteMessage(id, btn) {
  if (btn) btn.disabled = true

  try {
    // ① 开门检查：删是"以你的身份"动数据，先确认登录。
    //    注意这跟"按钮有没有藏起来"是两回事 —— 藏按钮只是好看。
    setStatus('① 正在确认登录状态…', 'busy')
    const session = await withTimeout(requireLogin(), 15000)
    if (!session) return setStatus('这一步需要先登录，上面已经帮你把登录框打开了。', 'err')
    console.log('[第4步-①] 已登录：', session.user && session.user.email)

    // ② 删。一定带 .eq('id', …) —— 只删这一条，不准写"没有条件"的删除。
    setStatus('② 正在让云端删掉（编号 ' + id + '）…（最多等 15 秒）', 'busy')
    console.log('[第4步-②] 发出删除请求：{ id: ' + id + ' }')

    const res = await withTimeout(
      cloud.database.from('messages').delete().eq('id', id).select(),
      15000
    )
    console.log('[第4步-②] 云端回应：', res)

    const error = res && res.error
    const removed = res && res.data

    if (error) {
      // 42501 = 权限被拒
      if (error.code === '42501') {
        return setStatus('云端拒绝了这次删除：未登录，或者这条数据不归你。', 'err')
      }
      return setStatus('删除失败：' + (error.message || error), 'err')
    }

    // ⭐ 关键判据：不报错 ≠ 删掉了。要看真的删掉了几条。
    const n = Array.isArray(removed) ? removed.length : (removed ? 1 : 0)

    if (n === 0) {
      return setStatus(
        '⚠️ 一行都没删掉 —— 这条留言不归你（云端把它过滤掉了，而且不报错），' +
        '或者它已经不在了。这就是「沉默的失败」：没有报错，但什么也没发生。',
        'err'
      )
    }

    // ③ 删完再读一遍。删掉了也要读回来才算数。
    setStatus('③ 云端删掉了 ' + n + ' 条，正在重新读一遍列表…', 'ok')
    await loadMessages()
    setStatus('③ 已删掉（编号 ' + id + '）。列表就是刚从云端读回来的结果 —— 删掉了也要读回来才算数。', 'ok')
  } catch (e) {
    // 走到这里 = 代码自己出错了（不是服务器返回的错误）。一定要让它可见。
    console.error('[第4步] 出错了：', e)
    setStatus('删除出错：' + ((e && (e.message || e)) || '未知错误') + '（细节已打到 Console）', 'err')
  } finally {
    // 无论成功、失败还是抛错，按钮最后一定要恢复 ——
    // 否则你会遇到"点一次之后再点就没反应"（按钮一直是灰的）。
    if (btn) btn.disabled = false
  }
}

/* ── 兜底：任何"没被接住的错误"都要留痕 ──────────────────────
   浏览器默认会把这类错误悄悄吃掉：页面看着没事，其实某一步已经断了 ——
   这正是最难查的一类 bug。这两个监听器就是最后一道网：
   只要出错，页面上一定看得见一句话，Console 里一定有原文。 */
window.addEventListener('error', function (e) {
  if (!e.message) return   // 资源加载失败（例如图标 404）没有 message，跳过
  console.error('[页面出错]', e.message, e.filename + ':' + e.lineno)
  setStatus('页面出错：' + e.message + '（位置 ' + e.filename + ':' + e.lineno + '）', 'err')
})

window.addEventListener('unhandledrejection', function (e) {
  const reason = (e && e.reason) || {}
  console.error('[有一步出错了，但没人接住]', reason)
  setStatus('有一步出错了（没被接住）：' + (reason.message || reason) + ' —— 细节已打到 Console', 'err')
})

/* ── 启动 ────────────────────────────────────────────────────
   页面一打开先查登录状态，再读一次留言。
   点按钮可以再读一次 —— 用来验证"每次都是真的去云端"。 */
reloadEl.addEventListener('click', loadMessages)
showOrigin()
updateCount()
initAuth()
loadMessages()
