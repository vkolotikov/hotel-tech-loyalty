<?php

namespace App\Services\Loyalty\Stamps;

/**
 * Inside StampCards: a full card's reward was given by another run first (the card's conditional update found it
 * rewarded), so this run's transaction rolls back what it wrote — a second redemption, or points — and answers the
 * card as it stands. Never leaves StampCards.
 */
final class RewardAlreadyGiven extends \RuntimeException
{
}
