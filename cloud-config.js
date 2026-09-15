/* 云服务配置
 *
 * 这两个值来自「开通云服务」那一刻平台返回的 publicConfig，不是我编的。
 *
 * endpoint        —— 本应用的固定域名。同一个应用重复发布，域名不变，所以这个值是稳定的。
 * publishableKey  —— 只用来标识「你是哪个应用」，它本身不带任何权限。
 *                    服务端会另外校验「这个网页是从哪个域名打开的」，域名不对直接拒绝。
 *                    所以它写在源码里是安全的（浏览器里本来就看得到），但不要往日志里打。
 *
 * 除此之外的任何密钥（数据库密码、管理员凭据）都留在服务器那边，永远不会下发到网页里。
 * 这是云服务的设计前提：前端只拿"公开配置"，拿不到"钥匙"。
 */
window.CLOUD_CONFIG = {
  endpoint: 'https://message-board-74016.app.workbuddy.host',
  publishableKey: 'wbpk_R7A6b9xuCNqfkOMaHbrvLM_C0zarEdtPBE8lF772z0WJGZHisbBw3xW'
}
