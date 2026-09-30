import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRouter } from '../../../app/AppRouter'

const floodChecklistRecords = [
  {
    id: 'flood-household-plan-local-information',
    crisisType: 'flood',
    category: 'Household plan and essentials',
    categoryId: 'household-plan',
    itemId: 'local-information',
    task: 'Check your local flood risk',
    description: 'Complete this when you know the safer places and routes near you.',
    steps: [
      'Check whether your home and usual routes are flood-prone.',
      'Choose a safer place on higher ground.',
      'Write down a route that avoids low-lying roads and crossings.',
    ],
    displayOrder: 0,
    isActive: true,
  },
  {
    id: 'flood-household-plan-contact-plan',
    crisisType: 'flood',
    category: 'Household plan and essentials',
    categoryId: 'household-plan',
    itemId: 'contact-plan',
    task: 'Write down your household contact plan',
    description: 'Complete this when everyone knows how to reconnect if separated.',
    steps: ['Choose one household contact and one contact outside the area.', 'Write down their phone numbers.', 'Agree where you will meet if phone services fail.'],
    displayOrder: 1,
    isActive: true,
  },
  {
    id: 'flood-household-plan-kit-ready',
    crisisType: 'flood',
    category: 'Household plan and essentials',
    categoryId: 'household-plan',
    itemId: 'kit-ready',
    task: 'Pack an emergency kit',
    description: 'Complete this when essential supplies are together and easy to take.',
    steps: ['Pack water, a torch, batteries and a charged power bank.', 'Add medication, first-aid items and suitable food.', 'Store the kit above likely flood level.'],
    displayOrder: 2,
    isActive: true,
  },
  {
    id: 'flood-household-plan-items-lifted',
    crisisType: 'flood',
    category: 'Household plan and essentials',
    categoryId: 'household-plan',
    itemId: 'items-lifted',
    task: 'Plan which items to move higher',
    description: 'Complete this when important belongings can be protected before water rises.',
    steps: ['Identify documents, medicines and valuables that must be moved.', 'Choose a higher storage place.', 'Prepare waterproof bags or containers where practical.'],
    displayOrder: 3,
    isActive: true,
  },
  {
    id: 'flood-children-pets-dependants-plan',
    crisisType: 'flood',
    category: 'Children and pets',
    categoryId: 'children-pets',
    itemId: 'dependants-plan',
    task: 'Plan support for children and dependants',
    description: 'Complete this when each dependant has a named person to help them.',
    steps: ['Write down who will help each person.', 'Pack medication, clothing and comfort items.', 'Explain the safer place in calm, simple language.'],
    displayOrder: 0,
    isActive: true,
  },
  {
    id: 'flood-children-pets-pet-plan',
    crisisType: 'flood',
    category: 'Children and pets',
    categoryId: 'children-pets',
    itemId: 'pet-plan',
    task: 'Prepare to move your pets safely',
    description: 'Complete this when pet transport and essential supplies are ready.',
    steps: ['Keep a carrier, cage or lead ready.', 'Pack pet food, water and medication.', 'Identify a safer destination that accepts pets.'],
    displayOrder: 1,
    isActive: true,
  },
  {
    id: 'flood-health-access-medicine-plan',
    crisisType: 'flood',
    category: 'Health and accessibility',
    categoryId: 'health-access',
    itemId: 'medicine-plan',
    task: 'Prepare medication and accessibility support',
    description: 'Complete this when health items and assistance can move with you.',
    steps: ['Keep medication and prescriptions ready to take.', 'Arrange help for mobility, communication or other access needs.', 'Store important instructions in a waterproof bag.'],
    displayOrder: 0,
    isActive: true,
  },
  {
    id: 'flood-health-access-contacts-ready',
    crisisType: 'flood',
    category: 'Health and accessibility',
    categoryId: 'health-access',
    itemId: 'contacts-ready',
    task: 'Write down flood emergency contacts',
    description: 'Complete this when important numbers are available without internet.',
    steps: ['Write down VICSES 132 500 and household contacts.', 'Keep a paper copy with your emergency kit.', 'Remember that Triple Zero (000) is for life-threatening danger.'],
    displayOrder: 1,
    isActive: true,
  },
]

function jsonResponse(payload: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response)
}

describe('Epic 5 crisis preparation pages', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/crisis')
    vi.spyOn(window, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('/api/checklist')) {
        return jsonResponse({
          records: floodChecklistRecords,
          metadata: {
            version: '1.0',
            generatedAt: '2026-09-16T00:00:00.000Z',
            sourceName: 'ShieldAhead pre-crisis checklist',
          },
        })
      }
      if (url.includes('/api/helplines')) {
        return jsonResponse({
          records: [
            {
              id: 'ses-132-500',
              name: 'VICSES',
              serviceType: 'Flood and storm assistance',
              phone: '132 500',
              description: 'Help with flood and storm damage that is not life-threatening.',
              availability: '24 hours',
              coverageArea: 'Victoria',
              verifiedAgainst: 'https://www.ses.vic.gov.au/',
            },
          ],
          metadata: {
            version: '1.0',
            generatedAt: '2026-09-16T00:00:00.000Z',
            sourceName: 'ShieldAhead helpline directory',
          },
        })
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('puts each checklist inside its disaster page', async () => {
    render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Pre-crisis guidance' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Household preparation checklist' })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Prepare for bushfire/i })).toHaveAttribute('href', '/crisis/bushfire')
    expect(screen.getByRole('link', { name: /Prepare for flood/i })).toHaveAttribute('href', '/crisis/flood')
    expect(screen.getByRole('link', { name: /Prepare for an extended power outage/i })).toHaveAttribute('href', '/crisis/power-outage')
  })

  it('shows a hazard-specific checklist and stores progress locally', async () => {
    window.history.replaceState({}, '', '/crisis/flood')
    const { unmount } = render(<AppRouter />)

    expect(await screen.findByRole('heading', { name: 'Prepare for flood' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Flood Household Checklist' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Helpline numbers' })).toBeVisible()
    expect(screen.getByRole('link', { name: '132 500' })).toHaveAttribute('href', 'tel:132500')
    expect(screen.queryByText('Content source')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Preparation guidance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guide/i })).not.toBeInTheDocument()
    expect(await screen.findByText('0 of 8 complete')).toBeVisible()

    expect(screen.getByText('Your next step')).toBeVisible()
    expect(screen.queryByText('How to complete this')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Check your local flood risk/i }))
    expect(screen.getByText('1 of 8 complete')).toBeVisible()

    unmount()
    render(<AppRouter />)
    expect(await screen.findByRole('checkbox', { name: /Check your local flood risk/i })).toBeChecked()
  })
})
