/* 留言板自检 —— 它现在住在仓库里（scripts/check.mjs）
 *
 * 谁在跑它？
 *   ① 你自己在本地：node scripts/check.mjs
 *   ② GitHub Actions：每次推代码时自动跑（见 .github/workflows/check.yml）
 *
 * 为什么搬进仓库？
 *   以前它躺在我（AI）电脑的一个文件夹里，只有我记得跑它。
 *   放进仓库之后，机器每次都跑，不靠人记 —— 这就是这一步的全部意义。
 *
 * ★ 关键约定（GitHub Actions 靠它判断红绿）：
 *     全部通过       → 退出码 0  → 绿勾
 *     有任何一项没过 → 退出码 1  → 红叉
 *   正因为有这一条，"检查没过"才变成机器能报警的事，而不是靠人盯。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

// 这个脚本在 <仓库>/scripts/ 下面，往上退一级就是仓库根目录。
// 用脚本自己的位置来推导，而不是写死一个路径 ——
// 这样不管在哪台机器、哪个目录下跑，它都能找对文件。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = f => readFileSync(join(ROOT, f), 'utf8')

const html = read('index.html')
const js = read('script.js')
const css = read('style.css')

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')) }
}

console.log('\n【1】HTML 的 id 与 JS 的 getElementById 对账')
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
const refs = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i)
ok('id 无重名（共 ' + ids.length + ' 个）', dupIds.length === 0, '重复：' + dupIds.join(','))
const missing = refs.filter(r => !ids.includes(r))
const unused = ids.filter(i => !refs.includes(i))
ok('JS 引用的 id 都存在于 HTML', missing.length === 0, '缺失：' + missing.join(','))
console.log('     （HTML 里没被 JS 引用、只作样式/锚点用的 id：' + (unused.join(',') || '无') + '）')

console.log('\n【2】面板与标签配套')
const panes = [...html.matchAll(/data-pane="([^"]+)"/g)].map(m => m[1])
const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1])
ok('每个标签都有对应面板', tabs.every(t => panes.includes(t)), '标签：' + tabs.join(','))
const showPaneCalls = [...js.matchAll(/showPane\('([^']+)'\)/g)].map(m => m[1])
ok('showPane() 调用的名字都有对应面板',
  showPaneCalls.every(n => panes.includes(n)), '调用：' + [...new Set(showPaneCalls)].join(','))

console.log('\n【3】样式不许盖掉 [hidden]')
const paneRules = css.match(/\.pane\s*\{[^}]*\}/g) || []
const authRules = css.match(/\.auth\s*\{[^}]*\}/g) || []
ok('.pane 没有写 display', !paneRules.some(r => /display\s*:/.test(r)))
ok('.auth 没有写 display', !authRules.some(r => /display\s*:/.test(r)))

console.log('\n【4】禁用写法（云端 SDK 契约）')
const banned = [
  ['signInAnonymously', /signInAnonymously/],
  ['手写 fetch 打 /.cloud', /fetch\([^)]*\/\.cloud/],
  ['单独初始化 cloudbase', /cloudbase/i],
  ['给 insert 传 owner_id', /insert\([^)]*owner_id/],
  ['传 null 触发默认值', /owner_id:\s*null/],
  ['用 localStorage 存用户', /localStorage[\s\S]{0,40}(user|session|token)/i]
]
banned.forEach(([name, re]) => ok('无「' + name + '」', !re.test(js)))

// innerHTML 单独判：清空列表（= ''）是安全的；拿它渲染"别人写的内容"才危险。
// 所以要看每一次赋值右边到底是什么，而不是只要出现 innerHTML 就报错。
const innerHtmlAssigns = [...js.matchAll(/innerHTML\s*=\s*([^\n;]*)/g)].map(m => m[1].trim())
ok('innerHTML 只用来清空，没拿它渲染内容',
  innerHtmlAssigns.length > 0 && innerHtmlAssigns.every(v => v === "''" || v === '""'),
  '实际赋值：' + innerHtmlAssigns.join(' | '))

console.log('\n【5】云服务要求的 auth 能力齐全')
;[
  'signInWithPassword', 'signInWithOtp', 'sendOtp', 'verifyOtp',
  'resetPasswordForEmail', 'getSession', 'onAuthStateChange', 'signOut'
].forEach(fn => ok('有 ' + fn + '()', js.includes(fn + '(')))

console.log('\n【6】第 3 步（发留言）要件')
ok('用的是 .insert(', /\.from\('messages'\)[\s\S]{0,80}\.insert\(/.test(js))
ok('写入前有开门检查 requireLogin()', /await withTimeout\(requireLogin\(\)/.test(js) || /await requireLogin\(\)/.test(js))
ok('写入后把新行取回来（.select()，且做了"有没有这功能"的判断）',
  /typeof query\.select === 'function'/.test(js) && /query\.select\(\)/.test(js))
ok('写入后重新读了一遍列表', /cpMsg\([\s\S]{0,400}loadMessages\(\)/.test(js))
ok('处理了 42501（权限被拒）', /42501/.test(js))
ok('留言用 textContent 渲染而非 innerHTML', /body\.textContent\s*=\s*row\.content/.test(js))
ok('html 里有发留言按钮 cp-submit', /id="cp-submit"/.test(html))
ok('html 里有内容输入框 cp-text', /id="cp-text"/.test(html))

console.log('\n【6b】出错必留痕（为查"点了没反应"加的）')
ok('整个提交流程套在 try/catch 里', /try \{[\s\S]*?\} catch \(e\) \{/.test(js))
ok('catch 里会把错误显示到页面上', /cpMsg\('出错：'/.test(js))
ok('finally 里恢复按钮可点（防止"点一次后再点没反应"）', /finally \{[\s\S]{0,200}cpSubmit\.disabled = false/.test(js))
ok('有超时闹钟 withTimeout（防止请求永远悬着）', /function withTimeout/.test(js) && /15000/.test(js))
ok('开门检查也兜住了抛错', /\[开门检查\] 查登录状态时抛错/.test(js))
ok('装了全局 error 兜底', /addEventListener\('error'/.test(js))
ok('装了全局 unhandledrejection 兜底', /addEventListener\('unhandledrejection'/.test(js))
ok('每个阶段都有 console.log（分段定位）', (js.match(/\[第3步-/g) || []).length >= 4)

console.log('\n【7】第 4 步（只能删自己的）要件')
ok('用的是 .delete()', /\.delete\(\)/.test(js))
// 每一次删除都必须带条件。没有条件的删除 = 一条指令把整张表清空。
const delTails = [...js.matchAll(/\.delete\(\)([\s\S]{0,60})/g)].map(m => m[1])
ok('每次 .delete() 后面都带条件 .eq(',
  delTails.length > 0 && delTails.every(s => /^\s*\.eq\(/.test(s)),
  '实际：' + delTails.map(s => JSON.stringify(s.slice(0, 30))).join(' | '))
ok('删除后链 .select() 看删掉了哪几行', /\.delete\(\)\s*\.eq\([^)]*\)\s*\.select\(\)/.test(js))
ok('用"删掉几条"做判据（0 条 = 被 RLS 拦了）', /n === 0/.test(js) && /沉默的失败/.test(js))
ok('删除前有开门检查 requireLogin()', /await withTimeout\(requireLogin\(\)/.test(js))
ok('删除后重新读了一遍列表', /async function deleteMessage[\s\S]*?await loadMessages\(\)/.test(js))
ok('删除流程也套了 try/catch', /async function deleteMessage[\s\S]*?try \{[\s\S]*?\} catch \(e\) \{/.test(js))
ok('删除失败也恢复按钮（finally）', /finally \{[\s\S]{0,160}btn\.disabled = false/.test(js))
ok('删除前有二次确认（按钮变「真的删？」）', /真的删？/.test(js) && /dataset\.armed/.test(js))
ok('二次确认不依赖浏览器弹窗（那种弹窗可能被挡掉）', !/\bwindow\.confirm\(/.test(js) && !/(^|[^.\w])confirm\(/.test(js))
ok('做了前端"是不是我的"判断吗（应当没有，交给 RLS）',
  !/owner_id\s*===|isMine|row\.owner_id\s*==/.test(js))
ok('css 里有删除按钮样式', /button\.danger/.test(css))

/* ── 【8】密钥扫描 ───────────────────────────────────────────
   为什么这一步必须有？
     git 历史是删不掉的。密钥一旦被推上去，就算你下一个提交把文件删了，
     那一版也永远留在历史里，网上可能已经被人爬走了。
     所以"推之前先扫一遍"这件事，值得让机器每次都做。
   为什么扫全仓库、不只看代码文件？
     密钥可能被写在任何地方 —— 配置文件、注释、甚至 README 的例子里。
   为什么正则要写这么严（要求后面跟一长串字符）？
     不严就会误报。比如 HTML 里的 type="password" 只是输入框属性，
     单独一个 password 或 sk- 字样并不能说明有密钥。
     —— 只有"长到像真钥匙"的形状才报。 */
console.log('\n【8】密钥扫描（扫整个仓库，不只是代码文件）')

const SKIP_DIRS = new Set(['.git', 'node_modules'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.zip'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else {
      const dot = name.lastIndexOf('.')
      const ext = dot >= 0 ? name.slice(dot).toLowerCase() : ''
      if (!SKIP_EXT.has(ext)) out.push(p)
    }
  }
  return out
}

const SECRET_RULES = [
  ['OpenAI 风格的 sk- 密钥', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['api_key 后面跟着一长串', /api[_-]?key\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}/i],
  ['Bearer 后面跟着一长串', /Bearer\s+[A-Za-z0-9_.-]{24,}/],
  ['token 被赋成长串', /token\s*[:=]\s*['"][A-Za-z0-9_.-]{32,}['"]/i]
]

const files = walk(ROOT)
const hits = []
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const [label, re] of SECRET_RULES) {
    if (re.test(text)) hits.push(relative(ROOT, f).replace(/\\/g, '/') + ' → ' + label)
  }
}

ok('script.js 无 sk- / api_key', !/sk-|api_key/i.test(js))
ok('index.html 无 sk- / api_key', !/sk-|api_key/i.test(html))
ok('全仓库 ' + files.length + ' 个文件都没有密钥泄漏', hits.length === 0, hits.join(' ; '))

console.log('\n' + '='.repeat(46))
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
console.log(fail === 0
  ? '✅ 全部通过'
  : '❌ 有 ' + fail + ' 项没过 —— 修掉再推，别让红叉留在仓库里')
process.exit(fail === 0 ? 0 : 1)
