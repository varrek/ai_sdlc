<?php

namespace Tests;

use App\App;
use PHPUnit\Framework\TestCase;

final class AppTest extends TestCase
{
    public function testGreet(): void
    {
        $app = new App();
        $this->assertSame('Hello, world', $app->greet('world'));
    }
}
