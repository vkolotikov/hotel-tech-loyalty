<?php

namespace Tests\Unit\Support;

use App\Support\WidgetLeadReceipt;
use Tests\TestCase;

class WidgetLeadReceiptTest extends TestCase
{
    public function test_receipt_requires_saved_identity_and_is_stable_but_opaque(): void
    {
        config(['app.key' => 'test-key-one']);
        $this->assertNull(WidgetLeadReceipt::forInquiry(null));
        $this->assertNull(WidgetLeadReceipt::forInquiry(0));
        $receipt = WidgetLeadReceipt::forInquiry(123);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $receipt);
        $this->assertSame($receipt, WidgetLeadReceipt::forInquiry(123));
        $this->assertNotSame($receipt, WidgetLeadReceipt::forInquiry(124));
        config(['app.key' => 'test-key-two']);
        $this->assertNotSame($receipt, WidgetLeadReceipt::forInquiry(123));
        config(['app.key' => '']);
        $this->assertNull(WidgetLeadReceipt::forInquiry(123));
    }
}
