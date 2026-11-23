# 登入與管理員審核端對端測試（Playwright 攔截模擬 Supabase Auth / REST）。執行方式同 e2e/sync.py（port 4174）。
import asyncio, json, sys
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
R = []
def ok(n, c, x=''): R.append(c); print(('PASS ' if c else 'FAIL ') + n + (f' [{x}]' if x and not c else ''))
UID = '11111111-2222-3333-4444-555555555555'; OID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
async def main():
    S = {'otp': None, 'role': 'admin', 'patch': [], 'posts_auth': [], 'queue': [{'id': OID, 'client_id': 'x1', 'observed_at': '2026-11-20T04:00:00Z', 'place_id': 'backdoor', 'crowd_level': 4, 'queue_minutes': 10, 'note': '<b>xss</b>', 'source': 'app', 'created_at': '2026-11-20T04:01:00Z'}]}
    async def h(route):
        r = route.request; u = urlparse(r.url); path = u.path; auth = r.headers.get('authorization', '')
        J = lambda body, st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(body))
        if path == '/auth/v1/otp': S['otp'] = (json.loads(r.post_data)['email'], parse_qs(u.query)['redirect_to'][0]); return await J({})
        if path == '/auth/v1/user': return await (J({'id': UID, 'email': 'lead@cc.ncu.edu.tw'}) if auth == 'Bearer USERTOKEN' else J({}, 401))
        if path == '/auth/v1/logout': return await J({}, 204)
        if path == '/rest/v1/profiles' and r.method == 'GET': return await J([{'role': S['role']}])
        if path == '/rest/v1/profiles' and r.method == 'PATCH': S['patch'].append(('role', u.query, r.post_data)); return await route.fulfill(status=204, body='')
        if path == '/rest/v1/crowd_review_queue': return await J(S['queue'])
        if path == '/rest/v1/member_list': return await J([{'user_id': UID, 'email': 'mate@cc.ncu.edu.tw', 'role': 'reporter', 'created_at': '2026-11-20T00:00:00Z'}])
        if path == '/rest/v1/crowd_observations' and r.method == 'PATCH': S['patch'].append(('obs', u.query, r.post_data)); return await route.fulfill(status=204, body='')
        if path == '/rest/v1/crowd_observations' and r.method == 'POST': S['posts_auth'].append(auth); return await route.fulfill(status=201, body='')
        if path == '/rest/v1/crowd_observations_public': return await J([])
        return await J({}, 404)
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(**p.devices['iPhone 13']); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.route('https://e2etest.supabase.co/**', h)
        await pg.goto('http://localhost:4174/'); await pg.click('[data-tab=settings]'); await pg.wait_for_timeout(300)
        ok('未登入顯示登入表單', await pg.locator('#loginForm').count() == 1)
        await pg.fill('input[name=email]', 'abc'); await pg.click('#loginForm button'); await pg.wait_for_timeout(200)
        ok('無效 email 被擋', await pg.locator('#loginErr.on').count() == 1 and S['otp'] is None)
        await pg.fill('input[name=email]', 'Lead@cc.ncu.edu.tw'); await pg.click('#loginForm button'); await pg.wait_for_timeout(300)
        ok('寄送登入連結並帶回網站網址', S['otp'] == ('lead@cc.ncu.edu.tw', 'http://localhost:4174/'), S['otp'])
        await pg.goto('about:blank'); await pg.goto('http://localhost:4174/#access_token=USERTOKEN&refresh_token=RT&expires_in=3600&token_type=bearer&type=magiclink'); await pg.wait_for_timeout(600)
        ok('登入後網址 hash 已清除', '#' not in pg.url and 'USERTOKEN' not in pg.url, pg.url)
        await pg.click('[data-tab=settings]'); await pg.wait_for_timeout(300)
        m = await pg.inner_text('main'); ok('顯示帳號與管理員角色', 'lead@cc.ncu.edu.tw' in m and '管理員' in m)
        await pg.click('#loadAdmin'); await pg.wait_for_timeout(400)
        ok('載入待審與成員', await pg.locator('[data-rev]').count() == 2 and await pg.locator('[data-role]').count() == 1)
        ok('待審備註經過跳脫（無 XSS）', await pg.locator('main b:has-text("xss")').count() == 0 and '<b>xss</b>' in await pg.inner_text('main'))
        await pg.click(f'[data-rev="{OID}:approved"]'); await pg.wait_for_timeout(300)
        ok('核可送出 PATCH status', ('obs', f'id=eq.{OID}', '{"status":"approved"}') in S['patch'] and await pg.locator('[data-rev]').count() == 0, S['patch'])
        await pg.select_option(f'[data-role="{UID}"]', 'member'); await pg.wait_for_timeout(300)
        ok('變更成員角色', ('role', f'user_id=eq.{UID}', '{"role":"member"}') in S['patch'])
        await pg.click('[data-tab=explore]'); await pg.click('#tab-crowd'); await pg.click('#obsForm button[type=submit]'); await pg.wait_for_timeout(600)
        ok('登入後回報使用使用者 token', S['posts_auth'] and S['posts_auth'][-1] == 'Bearer USERTOKEN', S['posts_auth'])
        await pg.click('[data-tab=settings]'); await pg.click('#logout'); await pg.wait_for_timeout(300)
        ok('登出後回到登入表單、清除 session', await pg.locator('#loginForm').count() == 1 and await pg.evaluate("localStorage.getItem('campus-flow-session-v1')") is None)
        ok('無 JS 錯誤', not errs, errs)
        await b.close()
    print(f'{sum(R)}/{len(R)} 通過'); sys.exit(0 if all(R) else 1)
asyncio.run(main())
