import { describe, expect, it } from 'vitest'
import { renderBlocksToHtml, type Block as BuilderBlock } from '../../components/EmailBlockBuilder'
import type { Block } from './types'

/**
 * The server renders a campaign's body from its blocks (App\Services\Loyalty\Campaigns\CampaignBody); the full admin's
 * builder renders the same blocks in the browser. Both must give the same email, so a draft looks alike in either
 * preview and is sent as previewed. tests/Feature/LoyaltyWorkspace/CampaignsTest.php pins the server to this string;
 * this pins the builder to it. (The one known difference: the server also escapes an apostrophe, `&#039;`, which
 * renders the same.)
 */
const GOLDEN = '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">'
  + '<h1 style="margin:24px 24px 12px;font-size:32px;font-weight:bold;text-align:center;color:#1a1a1a;line-height:1.25;">Autumn at Lumière</h1>\n'
  + '<p style="margin:0 24px 16px;font-size:15px;line-height:1.6;text-align:left;color:#555555;">Hello &lt;friend&gt; &amp; &quot;guest&quot;<br>See you soon</p>\n'
  + '<div style="text-align:center;padding:8px 24px 16px;"><a href="https://lumiere.example/book?a=1&amp;b=2" style="background:#c9a84c;color:#0e0e0e;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;font-size:14px;">Book now</a></div>\n'
  + '<div style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" /></div>\n'
  + '<div style="height:24px;line-height:24px;font-size:1px;">&nbsp;</div></div>'

const blocks: Block[] = [
  { id: 'h1', type: 'heading', text: 'Autumn at Lumière', level: 1, align: 'center', color: '#1a1a1a' },
  { id: 't1', type: 'text', text: 'Hello <friend> & "guest"\nSee you soon', color: '#555555', align: 'left', fontSize: 15 },
  { id: 'b1', type: 'button', text: 'Book now', url: 'https://lumiere.example/book?a=1&b=2', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' },
  { id: 'd1', type: 'divider', color: '#e5e5e5' },
  { id: 's1', type: 'spacer', height: 24 },
]

describe('the workspace\'s blocks are the full admin\'s builder blocks', () => {
  it('render in the builder to the email the server renders', () => {
    // The workspace's Block is a subset of the builder's: the same objects type-check as the builder's own.
    const asBuilder: BuilderBlock[] = blocks
    expect(renderBlocksToHtml(asBuilder)).toBe(GOLDEN)
  })
})
