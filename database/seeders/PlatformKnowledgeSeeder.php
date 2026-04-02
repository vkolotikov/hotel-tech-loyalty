<?php

namespace Database\Seeders;

use App\Models\KnowledgeCategory;
use App\Models\KnowledgeItem;
use Illuminate\Database\Seeder;

/**
 * Seeds the Knowledge Base with SAMPLE hotel guest-facing FAQ content.
 * This content powers the website AI chatbot widget (not the admin AI).
 *
 * Hotels should customize these answers with their actual details.
 * Run: php artisan db:seed --class=PlatformKnowledgeSeeder
 *
 * Safe to re-run — updates existing items by question match.
 */
class PlatformKnowledgeSeeder extends Seeder
{
    public function run(): void
    {
        $orgId = 1; // Default org

        $categories = [
            'check_in_out' => [
                'name' => 'Check-in & Check-out',
                'description' => 'Arrival, departure, and stay logistics',
                'priority' => 10,
                'items' => [
                    ['question' => 'What are the check-in and check-out times?', 'answer' => 'Check-in is from 3:00 PM and check-out is at 11:00 AM. Early check-in and late check-out may be available upon request, subject to availability.', 'keywords' => ['check-in', 'check-out', 'time', 'arrival', 'departure']],
                    ['question' => 'Can I request early check-in or late check-out?', 'answer' => 'Yes! Early check-in (from 12:00 PM) and late check-out (until 2:00 PM) are available upon request. Please contact us in advance and we will do our best to accommodate you. Additional charges may apply.', 'keywords' => ['early', 'late', 'request', 'extend']],
                    ['question' => 'What documents do I need for check-in?', 'answer' => 'Please bring a valid government-issued photo ID (passport or national ID) and your booking confirmation. A credit card is required for the security deposit.', 'keywords' => ['documents', 'id', 'passport', 'check-in']],
                ],
            ],
            'rooms_amenities' => [
                'name' => 'Rooms & Amenities',
                'description' => 'Room types, facilities, and in-room amenities',
                'priority' => 9,
                'items' => [
                    ['question' => 'What room types are available?', 'answer' => 'We offer a variety of room types including Standard, Superior, Deluxe, and Suite categories. Each room features modern amenities, complimentary Wi-Fi, and stunning views. Visit our booking page for detailed room descriptions and photos.', 'keywords' => ['room', 'type', 'suite', 'standard', 'deluxe']],
                    ['question' => 'Is Wi-Fi available?', 'answer' => 'Yes, complimentary high-speed Wi-Fi is available throughout the hotel, including all guest rooms, lobby, restaurant, and pool areas.', 'keywords' => ['wifi', 'internet', 'wi-fi', 'connection']],
                    ['question' => 'Is there a swimming pool?', 'answer' => 'Yes, we have an outdoor swimming pool available for all guests. Pool hours are from 7:00 AM to 10:00 PM. Towels are provided poolside.', 'keywords' => ['pool', 'swimming', 'swim']],
                    ['question' => 'Do you have a gym or fitness center?', 'answer' => 'Yes, our fitness center is open 24/7 for hotel guests and is equipped with cardio machines, free weights, and exercise mats.', 'keywords' => ['gym', 'fitness', 'exercise', 'workout']],
                    ['question' => 'Is there a spa?', 'answer' => 'Yes, our spa offers a full range of treatments including massages, facials, and body treatments. We recommend booking in advance. Please contact the front desk or visit our spa page for the menu and availability.', 'keywords' => ['spa', 'massage', 'treatment', 'wellness']],
                ],
            ],
            'dining' => [
                'name' => 'Dining & Restaurant',
                'description' => 'Restaurant info, breakfast, room service',
                'priority' => 8,
                'items' => [
                    ['question' => 'Is breakfast included?', 'answer' => 'Breakfast inclusion depends on your rate plan. Many of our packages include a complimentary buffet breakfast. Please check your booking confirmation or contact us for details.', 'keywords' => ['breakfast', 'included', 'buffet', 'morning']],
                    ['question' => 'What are the restaurant hours?', 'answer' => 'Our main restaurant serves breakfast from 7:00 AM to 10:30 AM, lunch from 12:00 PM to 3:00 PM, and dinner from 6:30 PM to 10:30 PM. The bar is open from 11:00 AM to midnight.', 'keywords' => ['restaurant', 'hours', 'dining', 'lunch', 'dinner']],
                    ['question' => 'Is room service available?', 'answer' => 'Yes, room service is available daily. A selection of dishes from our restaurant menu can be delivered to your room. Please dial the room service extension on your in-room phone.', 'keywords' => ['room service', 'food', 'delivery', 'order']],
                    ['question' => 'Do you accommodate dietary restrictions?', 'answer' => 'Absolutely! We cater to vegetarian, vegan, gluten-free, halal, and other dietary requirements. Please inform us of any allergies or preferences when making your reservation or upon arrival.', 'keywords' => ['dietary', 'vegetarian', 'vegan', 'gluten', 'allergy', 'halal']],
                ],
            ],
            'booking_payments' => [
                'name' => 'Booking & Payments',
                'description' => 'Reservations, cancellation, and payment policies',
                'priority' => 9,
                'items' => [
                    ['question' => 'How do I make a reservation?', 'answer' => 'You can book directly on our website for the best rates, or contact our reservations team by phone or email. We also accept bookings through major travel platforms.', 'keywords' => ['book', 'reservation', 'reserve', 'how to']],
                    ['question' => 'What is the cancellation policy?', 'answer' => 'Free cancellation is available up to 48 hours before check-in for most rate plans. Cancellations made within 48 hours may be subject to a one-night charge. Non-refundable rates cannot be cancelled. Please check your specific booking terms.', 'keywords' => ['cancel', 'cancellation', 'refund', 'policy']],
                    ['question' => 'What payment methods do you accept?', 'answer' => 'We accept all major credit cards (Visa, MasterCard, American Express), debit cards, bank transfers, and cash. A valid credit card is required at check-in for the security deposit.', 'keywords' => ['payment', 'credit card', 'pay', 'cash', 'visa']],
                    ['question' => 'Is a deposit required?', 'answer' => 'Yes, a security deposit is required at check-in. This is a hold on your credit card and will be released within 3-5 business days after check-out, provided there are no damages or outstanding charges.', 'keywords' => ['deposit', 'security', 'hold', 'charge']],
                ],
            ],
            'services' => [
                'name' => 'Services & Facilities',
                'description' => 'Concierge, parking, transfers, and general services',
                'priority' => 7,
                'items' => [
                    ['question' => 'Is parking available?', 'answer' => 'Yes, we offer on-site parking for guests. Valet parking service is also available. Please contact the front desk for rates and availability.', 'keywords' => ['parking', 'car', 'valet', 'garage']],
                    ['question' => 'Do you offer airport transfers?', 'answer' => 'Yes, we can arrange airport pickup and drop-off services. Please provide your flight details at least 24 hours in advance so we can schedule your transfer.', 'keywords' => ['airport', 'transfer', 'pickup', 'shuttle', 'transport']],
                    ['question' => 'Is there a concierge service?', 'answer' => 'Yes, our concierge team is available to help with restaurant reservations, tour bookings, transportation, and local recommendations. Visit the front desk or contact us anytime.', 'keywords' => ['concierge', 'help', 'recommend', 'tour', 'activities']],
                    ['question' => 'Do you allow pets?', 'answer' => 'Our pet policy varies by room type. Please contact us before booking to confirm pet-friendly options and any applicable fees.', 'keywords' => ['pet', 'dog', 'cat', 'animal']],
                    ['question' => 'Is there laundry service?', 'answer' => 'Yes, we offer laundry, dry cleaning, and pressing services. Items collected before 9:00 AM are returned the same day. Express service is also available.', 'keywords' => ['laundry', 'dry cleaning', 'wash', 'iron', 'press']],
                ],
            ],
            'loyalty_program' => [
                'name' => 'Loyalty Program',
                'description' => 'Membership, points, tiers, and rewards',
                'priority' => 8,
                'items' => [
                    ['question' => 'Do you have a loyalty program?', 'answer' => 'Yes! Our loyalty program rewards you for every stay. Earn points on your bookings and redeem them for free nights, upgrades, and exclusive benefits. Sign up for free at the front desk or through our app.', 'keywords' => ['loyalty', 'program', 'rewards', 'membership', 'points']],
                    ['question' => 'How do I earn points?', 'answer' => 'You earn points on every qualifying stay. Higher tier members earn points at accelerated rates. Points can also be earned through special promotions and partner activities.', 'keywords' => ['earn', 'points', 'accumulate', 'collect']],
                    ['question' => 'What are the loyalty tiers?', 'answer' => 'Our program has five tiers: Bronze, Silver, Gold, Platinum, and Diamond. Each tier offers progressively better benefits including bonus points, room upgrades, late check-out, and exclusive perks.', 'keywords' => ['tier', 'level', 'bronze', 'silver', 'gold', 'platinum', 'diamond']],
                    ['question' => 'How do I redeem my points?', 'answer' => 'You can redeem points for free nights, room upgrades, spa treatments, dining credits, and more. Contact the front desk or use our mobile app to check your balance and redeem rewards.', 'keywords' => ['redeem', 'use points', 'reward', 'free night']],
                ],
            ],
        ];

        foreach ($categories as $key => $catData) {
            $cat = KnowledgeCategory::updateOrCreate(
                ['organization_id' => $orgId, 'name' => $catData['name']],
                [
                    'description' => $catData['description'],
                    'priority' => $catData['priority'],
                    'sort_order' => $catData['priority'],
                    'is_active' => true,
                ]
            );

            foreach ($catData['items'] as $itemData) {
                KnowledgeItem::updateOrCreate(
                    ['organization_id' => $orgId, 'question' => $itemData['question']],
                    [
                        'category_id' => $cat->id,
                        'answer' => $itemData['answer'],
                        'keywords' => $itemData['keywords'],
                        'priority' => 5,
                        'is_active' => true,
                    ]
                );
            }
        }

        // Clean up old admin-focused items that were seeded by mistake
        $adminQuestions = [
            'What is Hotel Tech Platform?',
            'How do I get started with the platform?',
            'What are the main modules?',
            'How do I add a new guest?',
            'How do inquiries/sales pipeline work?',
            'How do reservations differ from PMS bookings?',
            'How do I check in or check out a guest?',
            'How do corporate accounts work?',
            'How does the tier system work?',
            'How do I award or redeem points?',
            'How do I create a special offer?',
            'What are benefits and how to configure them?',
            'How do NFC and QR cards work?',
            'How does PMS sync work?',
            'How do I track payments and unpaid bookings?',
            'How do I set up the public booking widget?',
            'What is the booking calendar?',
            'What can the AI assistant do?',
            'How do I use AI for lead capture?',
            'How do I configure the AI chatbot for my website?',
            'How does churn prediction work?',
            'What AI reports can I generate?',
            'What should I do every morning?',
            'What should I do weekly?',
            'How do I optimize revenue?',
            'How do I prevent guest churn?',
        ];

        KnowledgeItem::where('organization_id', $orgId)
            ->whereIn('question', $adminQuestions)
            ->delete();

        // Clean up old admin-focused categories
        $adminCategories = [
            'Getting Started',
            'CRM & Guest Management',
            'Booking Engine',
            'AI & Automation',
            'Operations & Best Practices',
        ];

        KnowledgeCategory::where('organization_id', $orgId)
            ->whereIn('name', $adminCategories)
            ->whereDoesntHave('items')
            ->delete();
    }
}
