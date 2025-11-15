import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

type EmailProvider = 'resend' | 'smtp';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private resend: Resend | null = null;
  private provider: EmailProvider;
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    // Determine which email provider to use
    this.provider = (this.configService.get('EMAIL_PROVIDER') || 'smtp') as EmailProvider;

    if (this.provider === 'resend') {
      this.initializeResend();
    } else {
      this.initializeSMTP();
    }
  }

  private initializeResend() {
    const apiKey = this.configService.get('RESEND_API_KEY');

    if (!apiKey) {
      this.logger.error('RESEND_API_KEY not configured');
      throw new Error('RESEND_API_KEY is required when using Resend provider');
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get('RESEND_FROM_EMAIL') || 'OpenLeague <noreply@openleague.com>';
    this.logger.log('Email service initialized with Resend provider');
  }

  private initializeSMTP() {
    const host = this.configService.get('EMAIL_HOST') || 'smtp.gmail.com';
    const port = parseInt(this.configService.get('EMAIL_PORT') || '587');
    const user = this.configService.get('EMAIL_USER');
    const pass = this.configService.get('EMAIL_PASSWORD');

    if (!user || !pass) {
      this.logger.error('EMAIL_USER and EMAIL_PASSWORD not configured');
      throw new Error('EMAIL_USER and EMAIL_PASSWORD are required when using SMTP provider');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });

    this.fromEmail = `"OpenLeague" <${user}>`;
    this.logger.log(`Email service initialized with SMTP provider (${host}:${port})`);
  }

  private async sendWithResend(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      throw new Error('Resend client not initialized');
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject,
        html,
      });

      if (error) {
        this.logger.error('Resend error:', error);
        throw new Error(`Failed to send email via Resend: ${error.message}`);
      }

      this.logger.log(`Email sent via Resend to ${to} (ID: ${data?.id})`);
    } catch (error) {
      this.logger.error('Error sending email via Resend:', error);
      throw error;
    }
  }

  private async sendWithSMTP(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP transporter not initialized');
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent via SMTP to ${to} (Message ID: ${info.messageId})`);
    } catch (error) {
      this.logger.error('Error sending email via SMTP:', error);
      throw error;
    }
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (this.provider === 'resend') {
      return this.sendWithResend(to, subject, html);
    } else {
      return this.sendWithSMTP(to, subject, html);
    }
  }

  async sendOtpEmail(email: string, code: string, purpose: string): Promise<void> {
    const subject =
      purpose === 'wallet_login'
        ? 'Código OTP para inicio de sesión con wallet'
        : 'Código de verificación';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">OpenLeague - ${subject}</h2>
        <p>Tu código de verificación es:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; border-radius: 5px;">
          <h1 style="color: #4CAF50; letter-spacing: 5px; margin: 0;">${code}</h1>
        </div>
        <p style="color: #666; margin-top: 20px;">
          Este código expirará en 10 minutos.
        </p>
        <p style="color: #666;">
          Si no solicitaste este código, puedes ignorar este correo.
        </p>
      </div>
    `;

    await this.sendEmail(email, subject, html);
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">¡Bienvenido a OpenLeague, ${name}!</h2>
        <p>Tu cuenta ha sido creada exitosamente.</p>
        <p style="color: #666;">
          Ahora puedes participar en torneos y vincular tus wallets.
        </p>
      </div>
    `;

    await this.sendEmail(email, 'Bienvenido a OpenLeague', html);
  }
}
